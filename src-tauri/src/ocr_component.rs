// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary. The PDFluent application is free to use,
// including for commercial purposes. Redistribution, or extraction or reuse
// of its components (including the embedded PDF engine), requires a licence.
// See https://pdfluent.com/license for terms.

//! The OCR component: Tesseract and its language packs, shipped inside the
//! signed application in every build (owner decision 19-10).
//!
//! Nothing is downloaded. The component sits under the app's resource folder
//! (`resources/ocr/{bin/tesseract[.exe],LICENSES,tessdata}`, staged by
//! `scripts/ocr-component/ocr-bundle.mjs` and mapped in by `tauri.conf.json`),
//! so OCR works offline from the first launch, the app has no HTTP client for
//! it, and the Mac App Store rule against downloading executable code (guideline
//! 2.5.2) is met by construction.
//!
//! The application binary itself still carries no OCR engine and no C or C++
//! code (claim B31 concerns the app binary): Tesseract is a separate signed
//! executable the app starts as a child process.
//!
//! What may be bundled is fixed at build time. The manifest
//! (`resources/ocr/tesseract-component.json`) is compiled into the application
//! and every file in it carries a SHA-256 and an exact size. The build checks
//! the bytes against it before bundling (`ocr-bundle.mjs --stage` / `--verify`);
//! at run time the sizes are checked again, and a bundle that is incomplete is
//! reported by name instead of being papered over. A manifest whose hashes are
//! not filled in (`published: false`) cannot be judged, so an unpublished
//! component reads as "not available yet" rather than running something nobody
//! pinned.
//!
//! The binary is the one file whose bytes the manifest cannot always pin: the
//! macOS bundle merges the two pinned thin binaries (arm64, x86_64) with `lipo`
//! and signs the result again with the release identity, so only its inputs
//! are the manifest's. The Windows binary is bundled as pinned (it is signed
//! before it is pinned), so there its size is checked at run time and its hash
//! in the build and the tests.

use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::collections::BTreeMap;
use std::path::{Component, Path, PathBuf};
use std::sync::OnceLock;

/// The manifest compiled into this build.
const MANIFEST_JSON: &str = include_str!("../resources/ocr/tesseract-component.json");

/// Where the bundled component sits below the app's resource folder
/// (`tauri.conf.json` maps the staged bundle here).
pub const BUNDLE_RESOURCE_DIR: &str = "resources/ocr";

/// Error codes the frontend maps to a message. The text after the colon, when
/// there is one, is detail for the log and the error panel.
pub const ERR_UNSUPPORTED_PLATFORM: &str = "OCR_COMPONENT_UNSUPPORTED_PLATFORM";
pub const ERR_NOT_INSTALLED: &str = "OCR_COMPONENT_NOT_INSTALLED";
pub const ERR_LANGUAGE_MISSING: &str = "OCR_LANGUAGE_MISSING";
pub const ERR_CHECKSUM: &str = "OCR_COMPONENT_CHECKSUM_MISMATCH";

const TESSDATA: &str = "tessdata";

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
    pub binary: String,
    pub files: Vec<FileEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct LanguageEntry {
    pub name: String,
    pub path: String,
    pub sha256: String,
    pub size: u64,
}

impl LanguageEntry {
    fn as_file(&self) -> FileEntry {
        FileEntry {
            path: self.path.clone(),
            sha256: self.sha256.clone(),
            size: self.size,
            executable: false,
        }
    }
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
    pub notices: Vec<Notice>,
    pub platforms: BTreeMap<String, PlatformEntry>,
    pub languages: BTreeMap<String, LanguageEntry>,
}

impl Manifest {
    /// Parse and check a manifest: every path relative and plain, every
    /// language code a short lowercase tag, and -- when it claims to be
    /// published -- every hash 64 hex digits and every size above zero.
    pub fn parse(json: &str) -> Result<Self, String> {
        let manifest: Manifest =
            serde_json::from_str(json).map_err(|e| format!("OCR component manifest: {e}"))?;
        manifest.check()?;
        Ok(manifest)
    }

    fn check(&self) -> Result<(), String> {
        if self.schema != 2 {
            return Err(format!("OCR component manifest: unknown schema {}", self.schema));
        }
        for (key, platform) in &self.platforms {
            check_relative_path(&platform.binary)
                .map_err(|e| format!("OCR component manifest: {key}: {e}"))?;
            if !platform.files.iter().any(|f| f.path == platform.binary && f.executable) {
                return Err(format!(
                    "OCR component manifest: {key}: the binary is not an executable file of the platform"
                ));
            }
            for file in &platform.files {
                check_relative_path(&file.path)
                    .map_err(|e| format!("OCR component manifest: {key}: {e}"))?;
                if self.published {
                    check_pinned(file).map_err(|e| format!("OCR component manifest: {key}: {e}"))?;
                }
            }
        }
        for (code, language) in &self.languages {
            if !is_language_code(code) {
                return Err(format!("OCR component manifest: bad language code {code:?}"));
            }
            if language.path != format!("{code}.traineddata") {
                return Err(format!(
                    "OCR component manifest: {code}: the file must be {code}.traineddata"
                ));
            }
            if self.published {
                check_pinned(&language.as_file())
                    .map_err(|e| format!("OCR component manifest: {code}: {e}"))?;
            }
        }
        Ok(())
    }
}

/// The manifest this build carries. Parsed once; a malformed manifest is a
/// build defect the unit tests catch, and at runtime it reads as "not
/// available" rather than a crash.
pub fn manifest() -> Result<&'static Manifest, String> {
    static MANIFEST: OnceLock<Result<Manifest, String>> = OnceLock::new();
    MANIFEST
        .get_or_init(|| Manifest::parse(MANIFEST_JSON))
        .as_ref()
        .map_err(|e| e.clone())
}

fn is_language_code(code: &str) -> bool {
    (3..=8).contains(&code.len())
        && code
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_')
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

/// A path from the manifest may only name a file under the component folder:
/// relative, no `..`, no root, no drive, and plain characters only.
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

/// `<os>-<arch>` as the manifest keys it: `macos-aarch64`, `windows-x86_64`.
pub fn platform_key() -> String {
    format!("{}-{}", std::env::consts::OS, std::env::consts::ARCH)
}

/// Platforms whose bundled binary is the pinned file itself (signed before it
/// is pinned). On macOS the bundled binary is the lipo merge of two pinned ones.
fn binary_is_pinned_exactly(platform: &str) -> bool {
    platform.starts_with("windows-")
}

// ── The bundled component ────────────────────────────────────────────────

/// A runnable component.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Installed {
    pub binary: PathBuf,
    pub tessdata: PathBuf,
    pub languages: Vec<String>,
}

impl Installed {
    /// Check that every language in `wanted` is present.
    pub fn require_languages(&self, wanted: &[String]) -> Result<(), String> {
        if wanted.is_empty() {
            return Err(format!("{ERR_LANGUAGE_MISSING}: no language chosen"));
        }
        for code in wanted {
            if !self.languages.iter().any(|l| l == code)
                || !self.tessdata.join(format!("{code}.traineddata")).is_file()
            {
                return Err(format!("{ERR_LANGUAGE_MISSING}:{code}"));
            }
        }
        Ok(())
    }
}

/// The component bundled in the app, checked against the manifest compiled into
/// the same build: the binary is a file and executable; every licence text and
/// every language pack exists with exactly the pinned size. All or nothing -- a
/// bundle missing one language is a defective build, not a smaller feature, and
/// says so by name.
///
/// On macOS the binary is not compared by size or hash: it is the `lipo` merge
/// of the two pinned thin binaries, signed again with the release identity, so
/// its bytes are by design not the manifest's. The build
/// (`scripts/ocr-component/ocr-bundle.mjs`) hashes the thin inputs against the
/// manifest before merging, and the app's own signature seals the result. On
/// Windows the bundled binary is the pinned file, so its size is checked here.
/// Hashes of everything pinned are checked in the build and in the tests
/// (`verify_bundle_hashes`), not at start-up.
pub fn bundled(bundle: &Path, manifest: &Manifest, platform: &str) -> Result<Installed, String> {
    let defect = |what: String| format!("{ERR_NOT_INSTALLED}:bundle: {what}");
    if !manifest.published {
        return Err(defect("the manifest is not published, so the bundle cannot be checked".into()));
    }
    let entry = manifest
        .platforms
        .get(platform)
        .ok_or_else(|| format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"))?;
    let binary = bundle.join(&entry.binary);
    let meta = std::fs::metadata(&binary).map_err(|e| defect(format!("{}: {e}", entry.binary)))?;
    if !meta.is_file() {
        return Err(defect(format!("{} is not a file", entry.binary)));
    }
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt as _;
        if meta.permissions().mode() & 0o111 == 0 {
            return Err(defect(format!("{} is not executable", entry.binary)));
        }
    }
    if binary_is_pinned_exactly(platform) {
        let pinned = entry
            .files
            .iter()
            .find(|f| f.path == entry.binary)
            .map(|f| f.size)
            .unwrap_or(0);
        check_bundle_file(&binary, &entry.binary, pinned).map_err(defect)?;
    }
    for file in entry.files.iter().filter(|f| f.path != entry.binary) {
        check_bundle_file(&bundle.join(&file.path), &file.path, file.size).map_err(defect)?;
    }
    let tessdata = bundle.join(TESSDATA);
    for lang in manifest.languages.values() {
        check_bundle_file(&tessdata.join(&lang.path), &format!("{TESSDATA}/{}", lang.path), lang.size)
            .map_err(defect)?;
    }
    Ok(Installed {
        binary,
        tessdata,
        languages: manifest.languages.keys().cloned().collect(),
    })
}

fn check_bundle_file(path: &Path, name: &str, size: u64) -> Result<(), String> {
    let meta = std::fs::metadata(path).map_err(|e| format!("{name}: {e}"))?;
    if !meta.is_file() || meta.len() != size {
        return Err(format!("{name}: {} bytes, the manifest pins {size}", meta.len()));
    }
    Ok(())
}

/// Hash every bundled file the manifest pins: licences, language packs and, on
/// Windows, the binary (on macOS the merged binary is covered by the note on
/// [`bundled`]). Slow-ish -- tens of megabytes -- so it runs in tests and the
/// build, not at start-up.
pub fn verify_bundle_hashes(bundle: &Path, manifest: &Manifest, platform: &str) -> Result<(), String> {
    let entry = manifest
        .platforms
        .get(platform)
        .ok_or_else(|| format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"))?;
    let mut checks: Vec<(PathBuf, String, String)> = Vec::new();
    for file in entry
        .files
        .iter()
        .filter(|f| f.path != entry.binary || binary_is_pinned_exactly(platform))
    {
        checks.push((bundle.join(&file.path), file.path.clone(), file.sha256.clone()));
    }
    for lang in manifest.languages.values() {
        checks.push((
            bundle.join(TESSDATA).join(&lang.path),
            format!("{TESSDATA}/{}", lang.path),
            lang.sha256.clone(),
        ));
    }
    let mut wrong = Vec::new();
    for (path, name, pinned) in checks {
        let bytes = std::fs::read(&path).map_err(|e| format!("{name}: {e}"))?;
        if !hex(&Sha256::digest(&bytes)).eq_ignore_ascii_case(&pinned) {
            wrong.push(name);
        }
    }
    if wrong.is_empty() {
        Ok(())
    } else {
        Err(format!("{ERR_CHECKSUM}: {}", wrong.join(", ")))
    }
}

/// A component outside the app, for development and CI only:
/// `PDFLUENT_OCR_COMPONENT_DIR` names a folder with `bin/tesseract[.exe]` and
/// `tessdata/`. Compiled out of release builds, so a shipped app only ever
/// runs the component it carries.
#[cfg(debug_assertions)]
pub fn development_override() -> Option<Installed> {
    let dir = std::env::var_os("PDFLUENT_OCR_COMPONENT_DIR")?;
    let dir = PathBuf::from(dir);
    let binary = dir
        .join("bin")
        .join(if cfg!(windows) { "tesseract.exe" } else { "tesseract" });
    let tessdata = dir.join(TESSDATA);
    let languages = std::fs::read_dir(&tessdata)
        .ok()?
        .filter_map(|e| e.ok())
        .filter_map(|e| {
            e.file_name()
                .to_str()
                .and_then(|n| n.strip_suffix(".traineddata"))
                .map(str::to_string)
        })
        .collect();
    binary.is_file().then_some(Installed {
        binary,
        tessdata,
        languages,
    })
}

#[cfg(not(debug_assertions))]
pub fn development_override() -> Option<Installed> {
    None
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct LanguageStatus {
    pub code: String,
    pub name: String,
    pub size: u64,
    pub installed: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ComponentFileStatus {
    pub path: String,
    pub size: u64,
}

/// What Settings and the Convert panel show. Nothing here is fetched: it is
/// the compiled-in manifest and what the bundle holds.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct ComponentStatus {
    /// The manifest carries pinned hashes, so the bundle can be checked.
    pub published: bool,
    /// The manifest has an entry for this machine.
    pub platform_supported: bool,
    pub platform: String,
    /// The bundle is complete and OCR can run.
    pub installed: bool,
    /// Why the bundle cannot be used, when it cannot (names the file).
    pub problem: Option<String>,
    pub component: String,
    pub version: String,
    /// Size of the component files for this platform, without languages.
    pub component_size: u64,
    pub files: Vec<ComponentFileStatus>,
    pub notices: Vec<Notice>,
    pub languages: Vec<LanguageStatus>,
    /// Set when the component in use comes from PDFLUENT_OCR_COMPONENT_DIR
    /// (debug builds only).
    pub development_override: bool,
}

pub fn status(bundle: &Path, manifest: &Manifest, platform: &str) -> ComponentStatus {
    let override_component = development_override();
    let found = bundled(bundle, manifest, platform);
    let problem = match (&override_component, &found) {
        (None, Err(e)) => Some(e.clone()),
        _ => None,
    };
    let component = override_component.clone().or_else(|| found.ok());
    let entry = manifest.platforms.get(platform);
    let present: Vec<String> = component
        .as_ref()
        .map(|i| i.languages.clone())
        .unwrap_or_default();
    ComponentStatus {
        published: manifest.published,
        platform_supported: entry.is_some(),
        platform: platform.to_string(),
        installed: component.is_some(),
        problem,
        component: manifest.component.clone(),
        version: manifest.version.clone(),
        component_size: entry.map(|p| p.files.iter().map(|f| f.size).sum()).unwrap_or(0),
        files: entry
            .map(|p| {
                p.files
                    .iter()
                    .map(|f| ComponentFileStatus {
                        path: f.path.clone(),
                        size: f.size,
                    })
                    .collect()
            })
            .unwrap_or_default(),
        notices: manifest.notices.clone(),
        languages: manifest
            .languages
            .iter()
            .map(|(code, l)| LanguageStatus {
                code: code.clone(),
                name: l.name.clone(),
                size: l.size,
                installed: present.iter().any(|c| c == code),
            })
            .collect(),
        development_override: override_component.is_some(),
    }
}

/// The component to run OCR with, or the error code that says why there is
/// none. A defect of the bundle is named, never turned into a vague
/// "not installed".
pub fn resolve(bundle: &Path, manifest: &Manifest, platform: &str) -> Result<Installed, String> {
    if let Some(dev) = development_override() {
        return Ok(dev);
    }
    if !manifest.platforms.contains_key(platform) {
        return Err(format!("{ERR_UNSUPPORTED_PLATFORM}:{platform}"));
    }
    bundled(bundle, manifest, platform)
}

// ── Finding the bundle ───────────────────────────────────────────────────

/// How an installed app lays out its resources, per platform. A parameter
/// (not `cfg!`) so every layout is tested on every machine.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AppLayout {
    /// `PDFluent.app/Contents/MacOS/<exe>` with resources in `Contents/Resources`
    /// (DMG, site and Mac App Store alike).
    MacOs,
    /// MSI and Store: resources sit next to the executable.
    Windows,
    /// `<prefix>/bin/<exe>` with resources in `<prefix>/lib/<app>`.
    Linux,
}

impl AppLayout {
    pub fn current() -> Self {
        if cfg!(target_os = "macos") {
            Self::MacOs
        } else if cfg!(windows) {
            Self::Windows
        } else {
            Self::Linux
        }
    }
}

/// Everything the lookup may consult, gathered by the caller so the lookup
/// itself is a pure function.
pub struct BundleSearch {
    /// `PDFLUENT_OCR_BUNDLE_DIR`; the caller passes `None` in release builds,
    /// so a shipped app only ever uses the bundle it carries.
    pub env_dir: Option<PathBuf>,
    /// What Tauri's `resource_dir()` returned. It fails with the opaque
    /// "unknown path" when the executable is neither inside an `.app` nor in a
    /// `target/{debug,release}` folder (for instance a Cargo target directory
    /// on another disk), which is why it is only one candidate of several.
    pub tauri_resource_dir: Result<PathBuf, String>,
    pub exe: Option<PathBuf>,
    /// Application name used for the Linux `lib/<name>` folder.
    pub app_name: String,
    /// Debug builds only: the staged bundle in the source tree
    /// (`src-tauri/resources/ocr-bundle`, `ocr-bundle.mjs --stage`).
    pub dev_stage_dir: Option<PathBuf>,
}

/// The places to look, in order, each with the reason it is on the list.
pub fn bundle_candidates(search: &BundleSearch, layout: AppLayout) -> Vec<(String, PathBuf)> {
    let mut out: Vec<(String, PathBuf)> = Vec::new();
    if let Some(dir) = &search.env_dir {
        out.push(("PDFLUENT_OCR_BUNDLE_DIR".into(), dir.clone()));
    }
    if let Ok(resources) = &search.tauri_resource_dir {
        out.push(("Tauri resource folder".into(), resources.join(BUNDLE_RESOURCE_DIR)));
    }
    if let Some(exe_dir) = search.exe.as_deref().and_then(Path::parent) {
        let beside = match layout {
            AppLayout::MacOs => exe_dir
                .parent()
                .map(|contents| contents.join("Resources").join(BUNDLE_RESOURCE_DIR)),
            AppLayout::Windows => Some(exe_dir.join(BUNDLE_RESOURCE_DIR)),
            AppLayout::Linux => exe_dir
                .parent()
                .map(|prefix| prefix.join("lib").join(&search.app_name).join(BUNDLE_RESOURCE_DIR)),
        };
        if let Some(path) = beside {
            out.push(("next to the executable".into(), path));
        }
    }
    if let Some(dir) = &search.dev_stage_dir {
        out.push(("staged bundle in the source tree".into(), dir.clone()));
    }
    out
}

/// The first candidate that is a folder, else an error naming every path tried
/// (and why Tauri gave none), with the dev way out spelled out.
pub fn find_bundle(
    search: &BundleSearch,
    layout: AppLayout,
    is_dir: impl Fn(&Path) -> bool,
) -> Result<PathBuf, String> {
    let candidates = bundle_candidates(search, layout);
    if let Some((_, path)) = candidates.iter().find(|(_, p)| is_dir(p)) {
        return Ok(path.clone());
    }
    let mut tried: Vec<String> = candidates
        .iter()
        .map(|(why, path)| format!("{} ({why})", path.display()))
        .collect();
    if let Err(e) = &search.tauri_resource_dir {
        tried.push(format!("Tauri resource folder (not available: {e})"));
    }
    if tried.is_empty() {
        tried.push("no location could be derived".into());
    }
    Err(format!(
        "{ERR_NOT_INSTALLED}:bundle: OCR bundle folder not found; tried: {}. \
         In a development run stage it with `node scripts/ocr-component/ocr-bundle.mjs --stage` \
         or point PDFLUENT_OCR_BUNDLE_DIR (or PDFLUENT_OCR_COMPONENT_DIR) at one",
        tried.join("; ")
    ))
}

/// Status for a build whose bundle folder could not be found: the same shape
/// as any other status, with `problem` carrying the paths that were tried, so
/// the UI shows "OCR not available in this build" instead of a failed call.
pub fn status_unresolved(manifest: &Manifest, platform: &str, problem: String) -> ComponentStatus {
    let mut status = status(Path::new(""), manifest, platform);
    if !status.installed {
        status.problem = Some(problem);
    }
    status
}

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn scratch(name: &str) -> PathBuf {
        let dir = std::env::temp_dir().join(format!(
            "pdfluent-ocr-component-{name}-{}",
            std::process::id()
        ));
        let _ = std::fs::remove_dir_all(&dir);
        std::fs::create_dir_all(&dir).unwrap();
        dir
    }

    fn sha(bytes: &[u8]) -> String {
        hex(&Sha256::digest(bytes))
    }

    /// A published manifest over the given files, keyed for this machine.
    fn published_manifest(binary: &[u8], licence: &[u8], eng: &[u8], nld: &[u8]) -> Manifest {
        let bin_name = if cfg!(windows) { "bin/tesseract.exe" } else { "bin/tesseract" };
        let mut platforms = BTreeMap::new();
        platforms.insert(
            platform_key(),
            PlatformEntry {
                binary: bin_name.to_string(),
                files: vec![
                    FileEntry { path: bin_name.into(), sha256: sha(binary), size: binary.len() as u64, executable: true },
                    FileEntry { path: "LICENSES/tesseract-LICENSE.txt".into(), sha256: sha(licence), size: licence.len() as u64, executable: false },
                ],
            },
        );
        let mut languages = BTreeMap::new();
        languages.insert("eng".into(), LanguageEntry { name: "English".into(), path: "eng.traineddata".into(), sha256: sha(eng), size: eng.len() as u64 });
        languages.insert("nld".into(), LanguageEntry { name: "Nederlands".into(), path: "nld.traineddata".into(), sha256: sha(nld), size: nld.len() as u64 });
        let manifest = Manifest {
            schema: 2,
            component: "tesseract-ocr".into(),
            version: "9.9.9".into(),
            revision: 1,
            published: true,
            notices: vec![],
            platforms,
            languages,
        };
        manifest.check().expect("test manifest is valid");
        manifest
    }

    #[test]
    fn the_shipped_manifest_parses_and_names_every_platform_that_ships() {
        let m = manifest().expect("the compiled-in manifest must parse");
        for key in ["macos-aarch64", "macos-x86_64", "windows-x86_64"] {
            assert!(m.platforms.contains_key(key), "no entry for {key}");
        }
        // The editor ships on macOS and Windows only (owner, 18-10): no
        // component is bundled for a platform nobody tests the editor on.
        assert_eq!(m.platforms.len(), 3, "{:?}", m.platforms.keys().collect::<Vec<_>>());
        for code in ["eng", "nld", "deu", "fra"] {
            assert!(m.languages.contains_key(code), "no language pack {code}");
        }
        for notice in ["Tesseract OCR", "Leptonica", "tessdata_fast language data"] {
            assert!(m.notices.iter().any(|n| n.name == notice), "no notice for {notice}");
        }
        // Every notice's licence text travels with the component.
        for (key, p) in &m.platforms {
            for n in &m.notices {
                assert!(p.files.iter().any(|f| f.path == n.file), "{key} lacks {}", n.file);
            }
        }
    }

    #[test]
    fn a_published_manifest_with_a_missing_hash_is_refused() {
        let mut m = published_manifest(b"bin", b"lic", b"eng", b"nld");
        m.languages.get_mut("eng").unwrap().sha256 = String::new();
        let json = serde_json::to_string(&m).unwrap();
        let err = Manifest::parse(&json).unwrap_err();
        assert!(err.contains("sha256 is not pinned"), "{err}");
    }

    #[test]
    fn manifest_paths_cannot_leave_the_component_folder() {
        for bad in ["../x", "/etc/passwd", "bin/../../x", "C:/x", "bin\\x", "", "a//b", "bin/"] {
            assert!(check_relative_path(bad).is_err(), "{bad:?} accepted");
        }
        for good in ["bin/tesseract", "bin/tesseract.exe", "LICENSES/zlib-LICENSE.txt", "eng.traineddata"] {
            assert!(check_relative_path(good).is_ok(), "{good:?} refused");
        }
        let mut m = published_manifest(b"bin", b"lic", b"eng", b"nld");
        m.platforms.values_mut().next().unwrap().files[1].path = "../escape.txt".into();
        assert!(Manifest::parse(&serde_json::to_string(&m).unwrap()).is_err());
    }

    /// Lay out a bundle the way `ocr-bundle.mjs` does, from the same bytes the
    /// manifest pins.
    fn bundle_fixture(name: &str) -> (Manifest, PathBuf) {
        let (bin, lic, eng, nld) = (b"#!fake-binary".to_vec(), b"Apache-2.0".to_vec(), b"eng-pack".to_vec(), b"nld-pack".to_vec());
        let manifest = published_manifest(&bin, &lic, &eng, &nld);
        let dir = scratch(name);
        std::fs::create_dir_all(dir.join("bin")).unwrap();
        std::fs::create_dir_all(dir.join("LICENSES")).unwrap();
        std::fs::create_dir_all(dir.join(TESSDATA)).unwrap();
        let binary = dir.join(&manifest.platforms[&platform_key()].binary);
        std::fs::write(&binary, bin).unwrap();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        std::fs::write(dir.join("LICENSES/tesseract-LICENSE.txt"), lic).unwrap();
        std::fs::write(dir.join(TESSDATA).join("eng.traineddata"), eng).unwrap();
        std::fs::write(dir.join(TESSDATA).join("nld.traineddata"), nld).unwrap();
        (manifest, dir)
    }

    #[test]
    fn the_component_is_found_in_the_bundle_with_every_language() {
        let (m, bundle) = bundle_fixture("bundle-found");
        let got = bundled(&bundle, &m, &platform_key()).expect("a complete bundle is installed");
        assert!(got.binary.starts_with(&bundle) && got.binary.is_file());
        assert_eq!(got.tessdata, bundle.join("tessdata"));
        assert_eq!(got.languages, vec!["eng".to_string(), "nld".to_string()]);
        got.require_languages(&["eng".into(), "nld".into()]).unwrap();
        verify_bundle_hashes(&bundle, &m, &platform_key()).expect("the bundled bytes are the pinned bytes");
    }

    #[test]
    fn status_reports_a_complete_bundle_as_installed_with_every_language() {
        let (m, bundle) = bundle_fixture("bundle-status");
        let s = status(&bundle, &m, &platform_key());
        assert!(s.published && s.platform_supported && s.installed, "{s:?}");
        assert!(s.problem.is_none(), "{s:?}");
        assert!(s.languages.iter().all(|l| l.installed), "every language is already there: {:?}", s.languages);
        assert_eq!(s.languages.iter().map(|l| l.code.as_str()).collect::<Vec<_>>(), vec!["eng", "nld"]);
        assert_eq!(s.files.len(), 2);
        assert_eq!(s.component_size, 13 + 10);
        let resolved = resolve(&bundle, &m, &platform_key()).expect("OCR resolves to the bundle");
        if !s.development_override {
            assert!(resolved.binary.starts_with(&bundle), "{}", resolved.binary.display());
        }
    }

    #[test]
    fn a_bundle_missing_a_language_or_the_wrong_size_is_refused_by_name() {
        let (m, bundle) = bundle_fixture("bundle-defects");
        let p = platform_key();
        std::fs::write(bundle.join("tessdata/nld.traineddata"), b"nld-pack-and-more").unwrap();
        let err = bundled(&bundle, &m, &p).unwrap_err();
        assert!(err.starts_with(ERR_NOT_INSTALLED) && err.contains("nld.traineddata"), "{err}");
        std::fs::write(bundle.join("tessdata/nld.traineddata"), b"nld-pack").unwrap();
        std::fs::remove_file(bundle.join("tessdata/eng.traineddata")).unwrap();
        let err = bundled(&bundle, &m, &p).unwrap_err();
        assert!(err.contains("eng.traineddata"), "{err}");
        // The defect is reported as it is, in the run and in the status.
        let err = resolve(&bundle, &m, &p).unwrap_err();
        assert!(err.contains("eng.traineddata"), "{err}");
        let s = status(&bundle, &m, &p);
        assert!(s.development_override || (!s.installed && s.problem.as_deref().is_some_and(|p| p.contains("eng.traineddata"))), "{s:?}");
    }

    #[test]
    fn a_bundled_binary_that_is_missing_or_not_executable_is_refused() {
        let (m, bundle) = bundle_fixture("bundle-binary");
        let p = platform_key();
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            let binary = bundle.join("bin/tesseract");
            std::fs::set_permissions(&binary, std::fs::Permissions::from_mode(0o644)).unwrap();
            assert!(bundled(&bundle, &m, &p).unwrap_err().contains("not executable"));
        }
        std::fs::remove_file(bundle.join(&m.platforms[&p].binary)).unwrap();
        assert!(bundled(&bundle, &m, &p).unwrap_err().starts_with(ERR_NOT_INSTALLED));
    }

    #[test]
    fn a_bundle_cannot_be_judged_against_an_unpublished_manifest() {
        let (mut m, bundle) = bundle_fixture("bundle-unpublished");
        m.published = false;
        assert!(bundled(&bundle, &m, &platform_key()).unwrap_err().contains("not published"));
        let s = status(&bundle, &m, &platform_key());
        assert!(!s.published && (s.development_override || !s.installed), "{s:?}");
    }

    #[test]
    fn a_platform_the_manifest_does_not_name_is_unsupported() {
        let (m, bundle) = bundle_fixture("bundle-platform");
        assert!(resolve(&bundle, &m, "plan9-mips").unwrap_err().starts_with(ERR_UNSUPPORTED_PLATFORM));
        assert!(!status(&bundle, &m, "plan9-mips").platform_supported);
    }

    #[test]
    fn the_bundle_hash_check_catches_same_size_tampering() {
        let (m, bundle) = bundle_fixture("bundle-hash");
        // Same length, other bytes: only the hash can tell.
        std::fs::write(bundle.join("tessdata/eng.traineddata"), b"eng-evil").unwrap();
        assert!(bundled(&bundle, &m, &platform_key()).is_ok(), "the size check alone cannot see this");
        let err = verify_bundle_hashes(&bundle, &m, &platform_key()).unwrap_err();
        assert!(err.starts_with(ERR_CHECKSUM) && err.contains("tessdata/eng.traineddata"), "{err}");
    }

    #[test]
    fn a_pinned_windows_binary_is_checked_by_size_and_hash() {
        // The Windows binary is bundled as pinned. Exercised with a manifest
        // keyed for a Windows platform so the rule runs on every host.
        let (mut m, bundle) = bundle_fixture("bundle-windows");
        let key = "windows-x86_64".to_string();
        let mut entry = m.platforms.remove(&platform_key()).unwrap();
        entry.binary = "bin/tesseract.exe".into();
        entry.files[0].path = "bin/tesseract.exe".into();
        m.platforms.insert(key.clone(), entry);
        // On a Windows host the fixture already named it .exe, and there is
        // nothing to rename.
        std::fs::rename(bundle.join("bin/tesseract"), bundle.join("bin/tesseract.exe")).unwrap_or(());
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt as _;
            std::fs::set_permissions(bundle.join("bin/tesseract.exe"), std::fs::Permissions::from_mode(0o755)).unwrap();
        }
        bundled(&bundle, &m, &key).expect("the pinned binary is accepted");
        verify_bundle_hashes(&bundle, &m, &key).expect("hash of the binary matches");
        std::fs::write(bundle.join("bin/tesseract.exe"), b"#!fake-binarY").unwrap();
        assert!(bundled(&bundle, &m, &key).is_ok(), "same size passes the run-time check");
        let err = verify_bundle_hashes(&bundle, &m, &key).unwrap_err();
        assert!(err.contains("bin/tesseract.exe"), "{err}");
        std::fs::write(bundle.join("bin/tesseract.exe"), b"short").unwrap();
        assert!(bundled(&bundle, &m, &key).unwrap_err().contains("bin/tesseract.exe"));
    }

    #[test]
    fn no_download_code_is_part_of_the_build() {
        // Owner decision 19-10: one path, no download. The module has no HTTP
        // client, and the crate has no feature that would bring one back.
        let source = include_str!("ocr_component.rs");
        // Comments are not code: the licence header names pdfluent.com.
        let code: String = source
            .split("#[cfg(test)]")
            .next()
            .unwrap()
            .lines()
            .filter(|l| !l.trim_start().starts_with("//"))
            .collect::<Vec<_>>()
            .join("\n");
        for forbidden in ["reqwest", "Downloader", "https://", "http://"] {
            assert!(!code.contains(forbidden), "ocr_component.rs mentions {forbidden}");
        }
        let cargo = include_str!("../Cargo.toml");
        assert!(!cargo.contains("ocr-download"), "the ocr-download feature is back in Cargo.toml");
        // A test-only reqwest (tests/tls_smoke.rs) is fine; the app's own
        // [dependencies] must not name one.
        let app_deps = cargo.split("[dev-dependencies]").next().unwrap();
        assert!(!app_deps.contains("\nreqwest"), "a direct reqwest dependency is back in Cargo.toml");
    }

    // ── Finding the bundle ────────────────────────────────────────────────

    fn search(exe: &str) -> BundleSearch {
        BundleSearch {
            env_dir: None,
            tauri_resource_dir: Err("unknown path".into()),
            exe: Some(PathBuf::from(exe)),
            app_name: "pdfluent-desktop".into(),
            dev_stage_dir: None,
        }
    }

    fn only(paths: &[&str]) -> impl Fn(&Path) -> bool {
        let set: Vec<PathBuf> = paths.iter().map(PathBuf::from).collect();
        move |p: &Path| set.iter().any(|s| s == p)
    }

    #[test]
    fn macos_app_bundle_resolves_even_when_tauri_gives_no_resource_dir() {
        // DMG, site and Mac App Store share this layout.
        let s = search("/Applications/PDFluent.app/Contents/MacOS/pdfluent-desktop");
        let want = "/Applications/PDFluent.app/Contents/Resources/resources/ocr";
        assert_eq!(find_bundle(&s, AppLayout::MacOs, only(&[want])).unwrap(), PathBuf::from(want));
    }

    #[test]
    fn macos_prefers_the_tauri_resource_dir_when_it_has_one() {
        let mut s = search("/Applications/PDFluent.app/Contents/MacOS/pdfluent-desktop");
        s.tauri_resource_dir = Ok(PathBuf::from("/Applications/PDFluent.app/Contents/Resources"));
        let want = "/Applications/PDFluent.app/Contents/Resources/resources/ocr";
        assert_eq!(find_bundle(&s, AppLayout::MacOs, only(&[want])).unwrap(), PathBuf::from(want));
        assert_eq!(bundle_candidates(&s, AppLayout::MacOs)[0].1, PathBuf::from(want));
    }

    #[test]
    fn windows_resources_sit_next_to_the_executable() {
        let s = search("C:/Program Files/PDFluent/pdfluent-desktop.exe");
        let want = "C:/Program Files/PDFluent/resources/ocr";
        assert_eq!(find_bundle(&s, AppLayout::Windows, only(&[want])).unwrap(), PathBuf::from(want));
    }

    #[test]
    fn linux_resources_sit_under_lib_app_name() {
        let s = search("/usr/bin/pdfluent-desktop");
        let want = "/usr/lib/pdfluent-desktop/resources/ocr";
        assert_eq!(find_bundle(&s, AppLayout::Linux, only(&[want])).unwrap(), PathBuf::from(want));
    }

    #[test]
    fn dev_run_with_target_dir_on_another_disk_uses_the_staged_bundle() {
        // The case behind "unknown path": no `.app`, no `target/` in the path.
        let mut s = search("/Volumes/PDFluent-Builds/cargo/debug/pdfluent-desktop");
        s.dev_stage_dir = Some(PathBuf::from("/src/src-tauri/resources/ocr-bundle"));
        let got = find_bundle(&s, AppLayout::MacOs, only(&["/src/src-tauri/resources/ocr-bundle"])).unwrap();
        assert_eq!(got, PathBuf::from("/src/src-tauri/resources/ocr-bundle"));
    }

    #[test]
    fn env_dir_wins_over_everything_else() {
        let mut s = search("/Applications/PDFluent.app/Contents/MacOS/pdfluent-desktop");
        s.env_dir = Some(PathBuf::from("/custom/ocr"));
        let all = ["/custom/ocr", "/Applications/PDFluent.app/Contents/Resources/resources/ocr"];
        assert_eq!(find_bundle(&s, AppLayout::MacOs, only(&all)).unwrap(), PathBuf::from("/custom/ocr"));
    }

    #[test]
    fn a_missing_env_dir_falls_through_to_the_next_candidate() {
        let mut s = search("/Applications/PDFluent.app/Contents/MacOS/pdfluent-desktop");
        s.env_dir = Some(PathBuf::from("/custom/ocr"));
        let want = "/Applications/PDFluent.app/Contents/Resources/resources/ocr";
        assert_eq!(find_bundle(&s, AppLayout::MacOs, only(&[want])).unwrap(), PathBuf::from(want));
    }

    #[test]
    fn failure_names_every_path_tried_and_the_tauri_reason() {
        let mut s = search("/Volumes/B/cargo/debug/pdfluent-desktop");
        s.env_dir = Some(PathBuf::from("/custom/ocr"));
        s.dev_stage_dir = Some(PathBuf::from("/src/src-tauri/resources/ocr-bundle"));
        // Windows joins with a backslash; the paths named are the same ones.
        let err = find_bundle(&s, AppLayout::MacOs, |_| false).unwrap_err().replace('\\', "/");
        assert!(err.starts_with(ERR_NOT_INSTALLED), "{err}");
        for needle in [
            "/custom/ocr",
            "/Volumes/B/cargo/Resources/resources/ocr",
            "/src/src-tauri/resources/ocr-bundle",
            "unknown path",
            "PDFLUENT_OCR_BUNDLE_DIR",
            "ocr-bundle.mjs --stage",
        ] {
            assert!(err.contains(needle), "missing {needle:?} in {err}");
        }
    }

    #[test]
    fn unresolved_status_reports_the_problem_instead_of_failing() {
        let manifest = manifest().unwrap();
        let platform = platform_key();
        let status = status_unresolved(manifest, &platform, "OCR_COMPONENT_NOT_INSTALLED:bundle: tried x".into());
        if !status.development_override {
            assert!(!status.installed);
            assert_eq!(status.problem.as_deref(), Some("OCR_COMPONENT_NOT_INSTALLED:bundle: tried x"));
        }
    }
}
