// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The personal-data model as a separate, opt-in download.
//!
//! The pattern the OCR component used before it was bundled (19-10): the
//! application binary carries no model and no ONNX Runtime. Detecting names and addresses
//! needs both (about 200 MB of weights plus the runtime library), so they are
//! a component the user downloads on purpose, after a dialog that names every
//! file, its size, its licence and the host it comes from. Nothing is fetched
//! without that consent, and Settings removes it again.
//!
//! What may be downloaded is fixed at build time. The manifest
//! (`resources/pii/gliner-pii-component.json`) is compiled into the signed
//! application; every file carries a SHA-256 and an exact size. A file that
//! fails either is thrown away and the install fails. A manifest that is not
//! `published` cannot be installed at all, so an unpublished component reads as
//! "not available yet" instead of downloading something nobody pinned.
//!
//! `published` is also the release gate: it may only be `true` when the
//! evaluation in `tests/pii_eval.rs` passed against exactly this model and
//! this corpus (`docs/PII_DETECTION_GATE.md`). `gate-report.json` next to the
//! manifest records that run, and a test refuses a published manifest without
//! it.
//!
//! The network is not in this file. [`install`] takes a [`FileSource`]; there is
//! no production source yet. The OCR component's downloader that this was to
//! reuse is gone (OCR is bundled in every build since 19-10), so the app has no
//! HTTP client of its own and none is allowed: a download for this component
//! needs its own decision (docs/PII_DETECTION_GATE.md).
//!
//! Layout under the app data folder:
//!
//! ```text
//! pii/
//!   gliner-pii-base-v1.0-<revision>/
//!     model/model.onnx
//!     model/tokenizer.json
//!     runtime/libonnxruntime.dylib | onnxruntime.dll
//!     LICENSES/...
//!     receipt.json          written last: present means installed
//! ```

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::io::Read as _;
use std::path::{Component, Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::OnceLock;

/// Host label shown in the consent dialog. The scheme and the connection live
/// with the downloader, not here.
pub const COMPONENT_HOST_LABEL: &str = "components.pdfluent.com";

const MANIFEST_JSON: &str = include_str!("../resources/pii/gliner-pii-component.json");

pub const ERR_UNPUBLISHED: &str = "PII_COMPONENT_UNPUBLISHED";
pub const ERR_UNSUPPORTED_PLATFORM: &str = "PII_COMPONENT_UNSUPPORTED_PLATFORM";
pub const ERR_NOT_INSTALLED: &str = "PII_COMPONENT_NOT_INSTALLED";
pub const ERR_CHECKSUM: &str = "PII_COMPONENT_CHECKSUM_MISMATCH";
pub const ERR_SIZE: &str = "PII_COMPONENT_SIZE_MISMATCH";
pub const ERR_DOWNLOAD: &str = "PII_COMPONENT_DOWNLOAD_FAILED";
pub const ERR_NO_CONSENT: &str = "PII_COMPONENT_NO_CONSENT";
pub const ERR_BUSY: &str = "PII_COMPONENT_BUSY";
pub const ERR_CANCELLED: &str = "PII_COMPONENT_CANCELLED";
pub const ERR_DOWNLOAD_NOT_IN_BUILD: &str = "PII_COMPONENT_DOWNLOAD_NOT_IN_BUILD";
pub const ERR_MODEL_NOT_IN_BUILD: &str = "PII_MODEL_NOT_IN_BUILD";

// ── Manifest ─────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct FileEntry {
    pub path: String,
    pub sha256: String,
    pub size: u64,
    #[serde(default)]
    pub executable: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct PlatformEntry {
    /// The ONNX Runtime library to load, relative to the install folder.
    pub runtime: String,
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ModelInfo {
    pub name: String,
    pub license: String,
    pub source: String,
    /// The exact upstream commit the files were taken from; filled in when
    /// the component is published.
    pub source_revision: String,
    /// Longest span in words the network scores (`max_width` of its GLiNER
    /// configuration). Read from the model's config when the component is
    /// built; a wrong value makes the logits the wrong size, which is refused.
    #[serde(default = "default_max_width")]
    pub max_width: usize,
}

fn default_max_width() -> usize {
    crate::pii_gliner::DEFAULT_MAX_WIDTH
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Notice {
    pub name: String,
    pub version: String,
    pub license: String,
    pub source: String,
    pub file: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Manifest {
    pub schema: u32,
    pub component: String,
    pub version: String,
    pub revision: u32,
    pub published: bool,
    pub base_path: String,
    pub consent_text_version: u32,
    /// Languages the evaluation gate passed for. Only these are offered in the
    /// UI as covered by the model; empty until a gate run says otherwise.
    pub languages: Vec<String>,
    pub model: ModelInfo,
    pub notices: Vec<Notice>,
    /// Files every platform gets.
    pub shared: Vec<FileEntry>,
    pub platforms: BTreeMap<String, PlatformEntry>,
}

pub const MODEL_FILE: &str = "model/model.onnx";
pub const TOKENIZER_FILE: &str = "model/tokenizer.json";

impl Manifest {
    pub fn parse(json: &str) -> Result<Self, String> {
        let manifest: Manifest =
            serde_json::from_str(json).map_err(|e| format!("PII component manifest: {e}"))?;
        manifest.check()?;
        Ok(manifest)
    }

    fn check(&self) -> Result<(), String> {
        if self.schema != 1 {
            return Err(format!("PII component manifest: unknown schema {}", self.schema));
        }
        if !self.base_path.starts_with('/') || self.base_path.contains("..") {
            return Err("PII component manifest: base_path must be an absolute URL path".into());
        }
        for code in &self.languages {
            if !(2..=3).contains(&code.len()) || !code.chars().all(|c| c.is_ascii_lowercase()) {
                return Err(format!("PII component manifest: bad language code {code:?}"));
            }
        }
        for required in [MODEL_FILE, TOKENIZER_FILE] {
            if !self.shared.iter().any(|f| f.path == required) {
                return Err(format!("PII component manifest: shared files lack {required}"));
            }
        }
        for file in &self.shared {
            self.check_file(file)?;
        }
        for (key, platform) in &self.platforms {
            check_relative_path(&platform.runtime).map_err(|e| format!("PII component manifest: {key}: {e}"))?;
            if !platform.files.iter().any(|f| f.path == platform.runtime) {
                return Err(format!("PII component manifest: {key}: the runtime library is not a file of the platform"));
            }
            for file in &platform.files {
                self.check_file(file).map_err(|e| format!("{e} ({key})"))?;
            }
        }
        if self.published && self.model.source_revision.len() < 7 {
            return Err("PII component manifest: a published component must name the upstream revision".into());
        }
        Ok(())
    }

    fn check_file(&self, file: &FileEntry) -> Result<(), String> {
        check_relative_path(&file.path).map_err(|e| format!("PII component manifest: {e}"))?;
        if self.published {
            check_pinned(file).map_err(|e| format!("PII component manifest: {e}"))?;
        }
        Ok(())
    }

    /// Every file this platform installs: shared first, then its own.
    pub fn files_for(&self, platform: &str) -> Option<Vec<FileEntry>> {
        let entry = self.platforms.get(platform)?;
        Some(self.shared.iter().chain(entry.files.iter()).cloned().collect())
    }

    pub fn install_dir_name(&self) -> String {
        format!("{}-{}", self.version, self.revision)
    }
}

pub fn manifest() -> Result<&'static Manifest, String> {
    static MANIFEST: OnceLock<Result<Manifest, String>> = OnceLock::new();
    MANIFEST
        .get_or_init(|| Manifest::parse(MANIFEST_JSON))
        .as_ref()
        .map_err(|e| e.clone())
}

fn check_pinned(file: &FileEntry) -> Result<(), String> {
    if file.sha256.len() != 64 || !file.sha256.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err(format!("{}: sha256 is not pinned", file.path));
    }
    if file.size == 0 {
        return Err(format!("{}: size is not pinned", file.path));
    }
    Ok(())
}

/// A manifest path may only name a file under the component folder.
pub fn check_relative_path(path: &str) -> Result<(), String> {
    if path.is_empty() || path.len() > 200 {
        return Err(format!("bad path {path:?}"));
    }
    if !path
        .chars()
        .all(|c| c.is_ascii_alphanumeric() || matches!(c, '.' | '_' | '-' | '/'))
    {
        return Err(format!("bad path {path:?}"));
    }
    for component in Path::new(path).components() {
        match component {
            Component::Normal(part) if part != "." && !part.is_empty() => {}
            _ => return Err(format!("bad path {path:?}")),
        }
    }
    if path.starts_with('/') || path.ends_with('/') || path.contains("//") {
        return Err(format!("bad path {path:?}"));
    }
    Ok(())
}

pub fn platform_key() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

/// Is the personal-data model offered at all in this build: the manifest is
/// published (so a gate run passed) and the build carries the inference code.
pub fn offered(manifest: &Manifest) -> bool {
    manifest.published && crate::pii_model::model_in_build()
}

// ── Installed state ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Consent {
    pub text_version: u32,
    pub at_unix: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct Receipt {
    pub component: String,
    pub version: String,
    pub revision: u32,
    pub platform: String,
    pub consent: Consent,
    pub files: Vec<FileEntry>,
}

const RECEIPT: &str = "receipt.json";

#[derive(Debug, Clone)]
pub struct ComponentRoot {
    root: PathBuf,
}

impl ComponentRoot {
    pub fn new(root: impl Into<PathBuf>) -> Self {
        Self { root: root.into() }
    }

    pub fn path(&self) -> &Path {
        &self.root
    }

    pub fn install_dir(&self, manifest: &Manifest) -> PathBuf {
        self.root.join(manifest.install_dir_name())
    }

    pub fn read_receipt(&self, manifest: &Manifest) -> Option<Receipt> {
        let bytes = std::fs::read(self.install_dir(manifest).join(RECEIPT)).ok()?;
        let receipt: Receipt = serde_json::from_slice(&bytes).ok()?;
        (receipt.version == manifest.version && receipt.revision == manifest.revision).then_some(receipt)
    }
}

/// An installed component, ready to load.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installed {
    pub model: PathBuf,
    pub tokenizer: PathBuf,
    pub runtime: PathBuf,
}

/// The installed component, if the receipt is there and every file it lists
/// still exists at the size it was verified at. Hashes are checked by
/// [`verify_installed`] when the model is about to be loaded.
pub fn installed(root: &ComponentRoot, manifest: &Manifest, platform: &str) -> Option<Installed> {
    let receipt = root.read_receipt(manifest)?;
    if receipt.platform != platform {
        return None;
    }
    let entry = manifest.platforms.get(platform)?;
    let dir = root.install_dir(manifest);
    for file in &receipt.files {
        check_relative_path(&file.path).ok()?;
        if std::fs::metadata(dir.join(&file.path)).ok()?.len() != file.size {
            return None;
        }
    }
    Some(Installed {
        model: dir.join(MODEL_FILE),
        tokenizer: dir.join(TOKENIZER_FILE),
        runtime: dir.join(&entry.runtime),
    })
}

/// SHA-256 and size of a file, streamed.
pub fn hash_file(path: &Path) -> Result<(String, u64), String> {
    let mut file = std::fs::File::open(path).map_err(|e| format!("{}: {e}", path.display()))?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 20];
    let mut total = 0u64;
    loop {
        let n = file.read(&mut buf).map_err(|e| format!("{}: {e}", path.display()))?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
        total += n as u64;
    }
    Ok((hex(&hasher.finalize()), total))
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

/// Re-hash every installed file against the manifest before the model is
/// loaded: an ONNX file is code the runtime executes, so a file changed on
/// disk after the install is refused instead of run.
pub fn verify_installed(root: &ComponentRoot, manifest: &Manifest, platform: &str) -> Result<Installed, String> {
    let found = installed(root, manifest, platform).ok_or_else(|| ERR_NOT_INSTALLED.to_string())?;
    let dir = root.install_dir(manifest);
    let wanted = manifest.files_for(platform).ok_or_else(|| format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"))?;
    for file in wanted {
        let (got, size) = hash_file(&dir.join(&file.path))?;
        if size != file.size {
            return Err(format!("{ERR_SIZE}:{}", file.path));
        }
        if !got.eq_ignore_ascii_case(&file.sha256) {
            return Err(format!("{ERR_CHECKSUM}:{}", file.path));
        }
    }
    Ok(found)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ComponentFileStatus {
    pub path: String,
    pub size: u64,
}

/// Everything the consent dialog and Settings show: the compiled-in manifest
/// and what is on disk. Nothing is fetched.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ComponentStatus {
    /// The evaluation gate passed and the manifest is pinned: the model may
    /// be offered. False means the UI shows validator-only detection and no
    /// download button.
    pub offered: bool,
    pub published: bool,
    /// This build carries the inference code (`pii-model` feature).
    pub model_in_build: bool,
    /// This build can download (wired to the shared downloader).
    pub download_in_build: bool,
    pub platform_supported: bool,
    pub platform: String,
    pub installed: bool,
    pub component: String,
    pub version: String,
    pub host: String,
    pub consent_text_version: u32,
    pub total_size: u64,
    pub files: Vec<ComponentFileStatus>,
    pub notices: Vec<Notice>,
    pub model: ModelInfo,
    /// Languages the gate passed for.
    pub languages: Vec<String>,
}

pub fn status(root: &ComponentRoot, manifest: &Manifest, platform: &str) -> ComponentStatus {
    let files = manifest.files_for(platform);
    ComponentStatus {
        offered: offered(manifest),
        published: manifest.published,
        model_in_build: crate::pii_model::model_in_build(),
        download_in_build: false,
        platform_supported: files.is_some(),
        platform: platform.to_string(),
        installed: installed(root, manifest, platform).is_some(),
        component: manifest.component.clone(),
        version: manifest.version.clone(),
        host: COMPONENT_HOST_LABEL.to_string(),
        consent_text_version: manifest.consent_text_version,
        total_size: files.as_ref().map(|f| f.iter().map(|x| x.size).sum()).unwrap_or(0),
        files: files
            .unwrap_or_default()
            .into_iter()
            .map(|f| ComponentFileStatus { path: f.path, size: f.size })
            .collect(),
        notices: manifest.notices.clone(),
        model: manifest.model.clone(),
        languages: manifest.languages.clone(),
    }
}

/// The component to run the model with, or the error code that says why not.
pub fn resolve(root: &ComponentRoot, manifest: &Manifest, platform: &str) -> Result<Installed, String> {
    if !offered(manifest) {
        let code = if manifest.published { ERR_MODEL_NOT_IN_BUILD } else { ERR_UNPUBLISHED };
        return Err(code.to_string());
    }
    if !manifest.platforms.contains_key(platform) {
        return Err(format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"));
    }
    verify_installed(root, manifest, platform)
}

/// Remove every installed version and anything an interrupted install left
/// behind. Only folders this module creates are touched: `gliner-pii-*` and
/// `.staging-*` directly under the PII folder.
pub fn remove_all(root: &ComponentRoot) -> Result<(), String> {
    let entries = match std::fs::read_dir(root.path()) {
        Ok(entries) => entries,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(()),
        Err(e) => return Err(format!("Could not read the personal-data model folder: {e}")),
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if (name.starts_with("gliner-pii-") || name.starts_with(".staging-")) && entry.path().is_dir() {
            std::fs::remove_dir_all(entry.path())
                .map_err(|e| format!("Could not remove the personal-data model: {e}"))?;
        }
    }
    Ok(())
}

fn write_receipt(dir: &Path, receipt: &Receipt) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(receipt).map_err(|e| e.to_string())?;
    let tmp = dir.join(format!("{RECEIPT}.partial"));
    std::fs::write(&tmp, json).map_err(|e| format!("Could not write the receipt: {e}"))?;
    std::fs::rename(&tmp, dir.join(RECEIPT)).map_err(|e| format!("Could not write the receipt: {e}"))
}

// ── Install ──────────────────────────────────────────────────────────────

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct Progress {
    pub file: String,
    pub downloaded: u64,
    pub total: u64,
}

#[derive(Debug, Clone)]
pub struct InstallRequest {
    /// The consent text version the user confirmed. Must equal the
    /// manifest's, so a changed dialog cannot ride on an old yes.
    pub consent_text_version: u32,
    pub consented: bool,
}

/// Where the bytes come from. Implementations write the file named by
/// `url_path` to `dest` and report progress; they do not need to verify it,
/// [`install`] does that for every file whatever the source.
pub trait FileSource {
    fn fetch(
        &self,
        url_path: &str,
        expected: &FileEntry,
        dest: &Path,
        on_bytes: &mut dyn FnMut(u64),
        cancel: &AtomicBool,
    ) -> Result<(), String>;
}

/// Checks that need no network.
pub fn plan_install(manifest: &Manifest, platform: &str, request: &InstallRequest) -> Result<(), String> {
    if !request.consented || request.consent_text_version != manifest.consent_text_version {
        return Err(ERR_NO_CONSENT.to_string());
    }
    if !manifest.published {
        return Err(ERR_UNPUBLISHED.to_string());
    }
    if !manifest.platforms.contains_key(platform) {
        return Err(format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"));
    }
    Ok(())
}

/// Install the component for `platform`. Assembled in a staging folder, every
/// file verified by size and SHA-256, the receipt written last, and the folder
/// renamed into place only then: an interrupted or refused install leaves no
/// half component behind.
pub fn install(
    root: &ComponentRoot,
    manifest: &Manifest,
    platform: &str,
    request: &InstallRequest,
    source: &dyn FileSource,
    progress: &mut dyn FnMut(Progress),
    cancel: &AtomicBool,
) -> Result<(), String> {
    use std::sync::atomic::Ordering;
    use std::time::{SystemTime, UNIX_EPOCH};

    plan_install(manifest, platform, request)?;
    if installed(root, manifest, platform).is_some() {
        return Ok(());
    }
    let files = manifest.files_for(platform).ok_or_else(|| format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"))?;
    let staging = root
        .path()
        .join(format!(".staging-{}-{}", manifest.install_dir_name(), std::process::id()));
    let total: u64 = files.iter().map(|f| f.size).sum();
    let mut downloaded = 0u64;

    let result: Result<(), String> = (|| {
        std::fs::create_dir_all(&staging).map_err(|e| format!("{ERR_DOWNLOAD}: could not create the folder: {e}"))?;
        for file in &files {
            if cancel.load(Ordering::SeqCst) {
                return Err(ERR_CANCELLED.to_string());
            }
            let dest = staging.join(&file.path);
            if let Some(parent) = dest.parent() {
                std::fs::create_dir_all(parent).map_err(|e| format!("{ERR_DOWNLOAD}:{}: {e}", file.path))?;
            }
            let url_path = format!("{}/{}", manifest.base_path, file.path);
            let name = file.path.clone();
            progress(Progress { file: name.clone(), downloaded, total });
            let mut on_bytes = |n: u64| {
                downloaded += n;
                progress(Progress { file: name.clone(), downloaded, total });
            };
            source.fetch(&url_path, file, &dest, &mut on_bytes, cancel)?;
            let (got, size) = hash_file(&dest).map_err(|e| format!("{ERR_DOWNLOAD}:{}: {e}", file.path))?;
            if size != file.size {
                return Err(format!("{ERR_SIZE}:{}: {size} bytes, {} pinned", file.path, file.size));
            }
            if !got.eq_ignore_ascii_case(&file.sha256) {
                return Err(format!("{ERR_CHECKSUM}:{}", file.path));
            }
        }
        write_receipt(
            &staging,
            &Receipt {
                component: manifest.component.clone(),
                version: manifest.version.clone(),
                revision: manifest.revision,
                platform: platform.to_string(),
                consent: Consent {
                    text_version: request.consent_text_version,
                    at_unix: SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0),
                },
                files: files.clone(),
            },
        )?;
        let final_dir = root.install_dir(manifest);
        if final_dir.exists() {
            std::fs::remove_dir_all(&final_dir)
                .map_err(|e| format!("{ERR_DOWNLOAD}: could not replace the old copy: {e}"))?;
        }
        std::fs::rename(&staging, &final_dir).map_err(|e| format!("{ERR_DOWNLOAD}: could not finish the install: {e}"))
    })();

    if result.is_err() {
        let _ = std::fs::remove_dir_all(&staging);
    } else {
        remove_other_versions(root, manifest);
    }
    result
}

fn remove_other_versions(root: &ComponentRoot, manifest: &Manifest) {
    let keep = manifest.install_dir_name();
    let Ok(entries) = std::fs::read_dir(root.path()) else { return };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().into_owned();
        if name.starts_with("gliner-pii-") && name != keep && entry.path().is_dir() {
            let _ = std::fs::remove_dir_all(entry.path());
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::atomic::Ordering;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!("pdfluent-pii-component-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sha(bytes: &[u8]) -> String {
        hex(&Sha256::digest(bytes))
    }

    fn entry(path: &str, bytes: &[u8]) -> FileEntry {
        FileEntry { path: path.into(), sha256: sha(bytes), size: bytes.len() as u64, executable: false }
    }

    /// A published manifest over small made-up files, keyed for this machine.
    fn published(model: &[u8], tok: &[u8], runtime: &[u8]) -> Manifest {
        let rt = if cfg!(windows) { "runtime/onnxruntime.dll" } else { "runtime/libonnxruntime.dylib" };
        let mut platforms = BTreeMap::new();
        platforms.insert(platform_key(), PlatformEntry { runtime: rt.into(), files: vec![entry(rt, runtime)] });
        let m = Manifest {
            schema: 1,
            component: "pii-model".into(),
            version: "gliner-pii-base-test".into(),
            revision: 1,
            published: true,
            base_path: "/pii/test".into(),
            consent_text_version: 1,
            languages: vec!["en".into()],
            model: ModelInfo { name: "test".into(), license: "Apache-2.0".into(), source: "example".into(), source_revision: "abcdef1234".into(), max_width: 12 },
            notices: vec![],
            shared: vec![entry(MODEL_FILE, model), entry(TOKENIZER_FILE, tok)],
            platforms,
        };
        m.check().expect("test manifest is valid");
        m
    }

    /// Serves files from a folder laid out like the host would.
    struct DirSource {
        base: PathBuf,
        corrupt: Option<&'static str>,
    }

    impl FileSource for DirSource {
        fn fetch(&self, url_path: &str, expected: &FileEntry, dest: &Path, on_bytes: &mut dyn FnMut(u64), _c: &AtomicBool) -> Result<(), String> {
            let mut bytes = std::fs::read(self.base.join(url_path.trim_start_matches('/')))
                .map_err(|e| format!("{ERR_DOWNLOAD}:{}: {e}", expected.path))?;
            if self.corrupt == Some(expected.path.as_str()) {
                bytes[0] ^= 0xff;
            }
            on_bytes(bytes.len() as u64);
            std::fs::write(dest, bytes).map_err(|e| e.to_string())
        }
    }

    fn host(dir: &Path, m: &Manifest, files: &[(&str, &[u8])]) -> PathBuf {
        let base = dir.join("host");
        for (path, bytes) in files {
            let p = base.join(m.base_path.trim_start_matches('/')).join(path);
            std::fs::create_dir_all(p.parent().unwrap()).unwrap();
            std::fs::write(p, bytes).unwrap();
        }
        base
    }

    fn rt_path() -> &'static str {
        if cfg!(windows) { "runtime/onnxruntime.dll" } else { "runtime/libonnxruntime.dylib" }
    }

    fn yes() -> InstallRequest {
        InstallRequest { consent_text_version: 1, consented: true }
    }

    #[test]
    fn the_shipped_manifest_parses_and_is_not_published_before_the_gate_passes() {
        let m = manifest().expect("the compiled-in manifest must parse");
        for key in ["macos-aarch64", "macos-x86_64", "windows-x86_64"] {
            assert!(m.platforms.contains_key(key), "no entry for {key}");
        }
        assert_eq!(m.platforms.len(), 3, "macOS and Windows only (owner, 18-10)");
        assert_eq!(m.model.name, "knowledgator/gliner-pii-base-v1.0");
        assert_eq!(m.model.license, "Apache-2.0");
        for n in ["GLiNER and gline-rs (input/output format reference)", "ONNX Runtime"] {
            assert!(m.notices.iter().any(|x| x.name == n), "no notice for {n}");
        }
        assert!(m.notices.iter().any(|x| x.name.starts_with("gliner-pii-base-v1.0")), "no notice for the model");
        for n in &m.notices {
            assert!(m.shared.iter().any(|f| f.path == n.file), "the licence text {} does not travel with the component", n.file);
        }
        if !m.published {
            assert!(m.languages.is_empty(), "an unpublished component claims no language");
        }
    }

    #[test]
    fn an_unpublished_manifest_cannot_be_installed_or_resolved() {
        let m = manifest().unwrap();
        if m.published {
            eprintln!("SKIPPED (not a pass): the compiled-in manifest is published; the unpublished path is covered by the next test");
            return;
        }
        assert_eq!(plan_install(m, "macos-aarch64", &yes()), Err(ERR_UNPUBLISHED.to_string()));
        assert!(!offered(m));
    }

    #[test]
    fn an_unpublished_manifest_is_refused_by_the_installer_even_with_consent() {
        let mut m = published(b"m", b"t", b"r");
        m.published = false;
        assert_eq!(plan_install(&m, &platform_key(), &yes()), Err(ERR_UNPUBLISHED.to_string()));
    }

    #[test]
    fn a_published_manifest_with_a_missing_hash_or_revision_is_refused() {
        let mut m = published(b"m", b"t", b"r");
        m.shared[0].sha256 = String::new();
        let err = Manifest::parse(&serde_json::to_string(&m).unwrap()).unwrap_err();
        assert!(err.contains("sha256 is not pinned"), "{err}");

        let mut m = published(b"m", b"t", b"r");
        m.model.source_revision = String::new();
        let err = Manifest::parse(&serde_json::to_string(&m).unwrap()).unwrap_err();
        assert!(err.contains("upstream revision"), "{err}");
    }

    #[test]
    fn manifest_paths_cannot_leave_the_component_folder() {
        for bad in ["../x", "/etc/passwd", "model/../../x", "C:/x", "model\\x", "", "a//b", "model/"] {
            assert!(check_relative_path(bad).is_err(), "{bad:?} accepted");
        }
        for good in [MODEL_FILE, TOKENIZER_FILE, "runtime/onnxruntime.dll", "LICENSES/x-LICENSE.txt"] {
            assert!(check_relative_path(good).is_ok(), "{good:?} refused");
        }
        let mut m = published(b"m", b"t", b"r");
        m.shared[1].path = "../escape.json".into();
        assert!(Manifest::parse(&serde_json::to_string(&m).unwrap()).is_err());
    }

    #[test]
    fn install_needs_the_consent_of_this_dialog_version() {
        let m = published(b"m", b"t", b"r");
        let p = platform_key();
        let no = InstallRequest { consent_text_version: 1, consented: false };
        assert_eq!(plan_install(&m, &p, &no), Err(ERR_NO_CONSENT.to_string()));
        let old = InstallRequest { consent_text_version: 0, consented: true };
        assert_eq!(plan_install(&m, &p, &old), Err(ERR_NO_CONSENT.to_string()));
        assert!(plan_install(&m, &p, &yes()).is_ok());
        assert!(plan_install(&m, "plan9-riscv", &yes()).unwrap_err().starts_with(ERR_UNSUPPORTED_PLATFORM));
    }

    #[test]
    fn an_install_verifies_every_file_and_writes_the_receipt_last() {
        let dir = scratch("install");
        let (model, tok, rt) = (b"model-bytes".as_slice(), b"{}".as_slice(), b"runtime".as_slice());
        let m = published(model, tok, rt);
        let base = host(&dir, &m, &[(MODEL_FILE, model), (TOKENIZER_FILE, tok), (rt_path(), rt)]);
        let root = ComponentRoot::new(dir.join("pii"));
        let mut seen = Vec::new();
        install(&root, &m, &platform_key(), &yes(), &DirSource { base, corrupt: None }, &mut |p| seen.push(p), &AtomicBool::new(false)).unwrap();

        let found = installed(&root, &m, &platform_key()).expect("installed");
        assert_eq!(std::fs::read(&found.model).unwrap(), model);
        assert!(found.runtime.ends_with(rt_path()));
        assert!(verify_installed(&root, &m, &platform_key()).is_ok());
        assert_eq!(seen.last().unwrap().downloaded, seen.last().unwrap().total);
        assert!(root.read_receipt(&m).unwrap().consent.text_version == 1);
        let leftovers: Vec<_> = std::fs::read_dir(root.path()).unwrap().flatten().filter(|e| e.file_name().to_string_lossy().starts_with(".staging")).collect();
        assert!(leftovers.is_empty());
    }

    #[test]
    fn a_corrupted_file_fails_the_install_and_leaves_nothing_behind() {
        for bad in [MODEL_FILE, TOKENIZER_FILE, rt_path()] {
            let dir = scratch("corrupt");
            let (model, tok, rt) = (b"model-bytes".as_slice(), b"{}".as_slice(), b"runtime".as_slice());
            let m = published(model, tok, rt);
            let base = host(&dir, &m, &[(MODEL_FILE, model), (TOKENIZER_FILE, tok), (rt_path(), rt)]);
            let root = ComponentRoot::new(dir.join("pii"));
            let err = install(&root, &m, &platform_key(), &yes(), &DirSource { base, corrupt: Some(bad) }, &mut |_| {}, &AtomicBool::new(false)).unwrap_err();
            assert!(err.starts_with(ERR_CHECKSUM), "{bad}: {err}");
            assert!(installed(&root, &m, &platform_key()).is_none());
            assert_eq!(std::fs::read_dir(root.path()).map(|d| d.count()).unwrap_or(0), 0, "{bad}: a half install survived");
        }
    }

    #[test]
    fn a_wrong_size_is_refused_even_when_the_source_does_not_check() {
        let dir = scratch("size");
        let (model, tok, rt) = (b"model-bytes".as_slice(), b"{}".as_slice(), b"runtime".as_slice());
        let mut m = published(model, tok, rt);
        m.shared[0].size += 1;
        let base = host(&dir, &m, &[(MODEL_FILE, model), (TOKENIZER_FILE, tok), (rt_path(), rt)]);
        let root = ComponentRoot::new(dir.join("pii"));
        let err = install(&root, &m, &platform_key(), &yes(), &DirSource { base, corrupt: None }, &mut |_| {}, &AtomicBool::new(false)).unwrap_err();
        assert!(err.starts_with(ERR_SIZE), "{err}");
    }

    #[test]
    fn a_cancelled_install_leaves_nothing_behind() {
        let dir = scratch("cancel");
        let (model, tok, rt) = (b"model-bytes".as_slice(), b"{}".as_slice(), b"runtime".as_slice());
        let m = published(model, tok, rt);
        let base = host(&dir, &m, &[(MODEL_FILE, model), (TOKENIZER_FILE, tok), (rt_path(), rt)]);
        let root = ComponentRoot::new(dir.join("pii"));
        let cancel = AtomicBool::new(true);
        cancel.store(true, Ordering::SeqCst);
        let err = install(&root, &m, &platform_key(), &yes(), &DirSource { base, corrupt: None }, &mut |_| {}, &cancel).unwrap_err();
        assert_eq!(err, ERR_CANCELLED);
        assert_eq!(std::fs::read_dir(root.path()).map(|d| d.count()).unwrap_or(0), 0);
    }

    #[test]
    fn a_file_changed_after_the_install_is_refused_at_load_time() {
        let dir = scratch("tamper");
        let (model, tok, rt) = (b"model-bytes".as_slice(), b"{}".as_slice(), b"runtime".as_slice());
        let m = published(model, tok, rt);
        let base = host(&dir, &m, &[(MODEL_FILE, model), (TOKENIZER_FILE, tok), (rt_path(), rt)]);
        let root = ComponentRoot::new(dir.join("pii"));
        install(&root, &m, &platform_key(), &yes(), &DirSource { base, corrupt: None }, &mut |_| {}, &AtomicBool::new(false)).unwrap();
        // Same size, different bytes: the size check in `installed` passes.
        std::fs::write(root.install_dir(&m).join(MODEL_FILE), b"model-BYTES").unwrap();
        assert!(installed(&root, &m, &platform_key()).is_some());
        let err = verify_installed(&root, &m, &platform_key()).unwrap_err();
        assert!(err.starts_with(ERR_CHECKSUM), "{err}");
    }

    #[test]
    fn remove_all_removes_only_our_folders() {
        let dir = scratch("remove");
        let root = ComponentRoot::new(dir.join("pii"));
        for name in ["gliner-pii-base-v1.0-1", ".staging-x-1", "somebody-else"] {
            std::fs::create_dir_all(root.path().join(name)).unwrap();
        }
        remove_all(&root).unwrap();
        let left: Vec<String> = std::fs::read_dir(root.path()).unwrap().flatten().map(|e| e.file_name().to_string_lossy().into_owned()).collect();
        assert_eq!(left, ["somebody-else"]);
        assert!(remove_all(&ComponentRoot::new(dir.join("missing"))).is_ok());
    }
}
