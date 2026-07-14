// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
// See https://pdfluent.com/license for terms.

import Foundation
import Translation

struct TranslationRequest: Codable {
    let sourceLanguage: String
    let targetLanguage: String
    let texts: [String]
}

struct TranslationResponse: Codable {
    let success: Bool
    let sourceLanguage: String?
    let targetLanguage: String?
    let translations: [String]
    let error: String?
}

func emit(_ response: TranslationResponse) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.withoutEscapingSlashes]
    if let data = try? encoder.encode(response), let json = String(data: data, encoding: .utf8) {
        print(json)
    } else {
        print("{\"success\":false,\"translations\":[],\"error\":\"json-encode-failed\"}")
    }
}

@main
struct Main {
    static func main() async {
        if #available(macOS 26.0, *) {
            do {
                let input = FileHandle.standardInput.readDataToEndOfFile()
                let request = try JSONDecoder().decode(TranslationRequest.self, from: input)
                let source = Locale.Language(identifier: request.sourceLanguage)
                let target = Locale.Language(identifier: request.targetLanguage)
                let session = TranslationSession(installedSource: source, target: target)
                var translations: [String] = []

                for text in request.texts {
                    let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
                    if trimmed.isEmpty {
                        translations.append(text)
                        continue
                    }
                    let response = try await session.translate(text)
                    translations.append(response.targetText)
                }

                emit(TranslationResponse(
                    success: true,
                    sourceLanguage: request.sourceLanguage,
                    targetLanguage: request.targetLanguage,
                    translations: translations,
                    error: nil
                ))
            } catch {
                emit(TranslationResponse(
                    success: false,
                    sourceLanguage: nil,
                    targetLanguage: nil,
                    translations: [],
                    error: String(describing: error)
                ))
            }
        } else {
            emit(TranslationResponse(
                success: false,
                sourceLanguage: nil,
                targetLanguage: nil,
                translations: [],
                error: "macos-translation-framework-unavailable"
            ))
        }
    }
}
