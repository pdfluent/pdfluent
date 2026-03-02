// SPDX-License-Identifier: AGPL-3.0-or-later
// Copyright (c) 2026 PDFluent Contributors

// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    pdfluent_lib::run()
}
