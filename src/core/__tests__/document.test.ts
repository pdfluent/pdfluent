// Copyright (c) 2026 Innovation Trigger B.V. All rights reserved.
//
// This software is proprietary and confidential.
// Free for personal, non-commercial use.
// Commercial use requires a valid license.
// See https://pdfluent.com/license for terms.

import { describe, it, expect, beforeEach } from 'vitest';
import {
  createEmptyDocument,
  updateMetadata,
  updateDocumentState,
  getPageCount,
  getCurrentPage,
  getDisplayTitle,
  createSnapshot,
  areDocumentsEqual,
  validateDocument,
  hasAnnotations,
  hasFormFields,
  isEncrypted,
} from '../document';

describe('Document Model', () => {
  describe('createEmptyDocument', () => {
    it('should create a valid empty document', () => {
      const document = createEmptyDocument('test.pdf');

      expect(document.id).toBeDefined();
      expect(document.fileName).toBe('test.pdf');
      expect(document.fileSize).toBe(0);
      expect(document.pages.length).toBe(0);
      expect(document.annotations.length).toBe(0);
      expect(document.formFields.length).toBe(0);
      expect(document.isModified).toBe(false);
    });

    it('should have valid metadata', () => {
      const document = createEmptyDocument('test.pdf');

      expect(document.metadata.title).toBe('test.pdf');
      expect(document.metadata.author).toBe('');
      expect(document.metadata.creator).toBe('PDFluent');
      expect(document.metadata.producer).toBe('PDFluent');
      expect(document.metadata.hasXfa).toBe(false);
      expect(document.metadata.pdfVersion).toBe('1.7');
    });

    it('should have valid document state', () => {
      const document = createEmptyDocument('test.pdf');

      expect(document.state.currentPage).toBe(0);
      expect(document.state.zoom).toBe(1.0);
      expect(document.state.viewMode).toBe('single');
      expect(document.state.locked).toBe(false);
      expect(document.state.permissions.canPrint).toBe(true);
      expect(document.state.permissions.canModify).toBe(true);
    });
  });

  describe('Document Operations', () => {
    let document: any;

    beforeEach(() => {
      document = createEmptyDocument('test.pdf');
    });

    it('updateMetadata should update document metadata', () => {
      const updated = updateMetadata(document, {
        title: 'New Title',
        author: 'Test Author',
        subject: 'Test Subject',
      });

      expect(updated.metadata.title).toBe('New Title');
      expect(updated.metadata.author).toBe('Test Author');
      expect(updated.metadata.subject).toBe('Test Subject');
      expect(updated.isModified).toBe(true);
    });

    it('updateDocumentState should update navigation state', () => {
      const updated = updateDocumentState(document, {
        currentPage: 5,
        zoom: 2.0,
        viewMode: 'continuous',
      });

      expect(updated.state.currentPage).toBe(5);
      expect(updated.state.zoom).toBe(2.0);
      expect(updated.state.viewMode).toBe('continuous');
      expect(updated.isModified).toBe(false); // State changes don't mark as modified
    });

    it('getPageCount should return page count', () => {
      expect(getPageCount(document)).toBe(0);
    });

    it('getCurrentPage should return undefined for empty document', () => {
      expect(getCurrentPage(document)).toBeUndefined();
    });

    it('getDisplayTitle should return title or filename', () => {
      expect(getDisplayTitle(document)).toBe('test.pdf');

      const withTitle = updateMetadata(document, { title: 'Document Title' });
      expect(getDisplayTitle(withTitle)).toBe('Document Title');
    });

    it('createSnapshot should create a shallow copy', () => {
      const snapshot = createSnapshot(document);
      expect(snapshot.id).toBe(document.id);
      expect(snapshot.fileName).toBe(document.fileName);
      expect(areDocumentsEqual(document, snapshot)).toBe(true);
    });
  });

  describe('Validation', () => {
    it('validateDocument should validate empty document', () => {
      const document = createEmptyDocument('test.pdf');
      const result = validateDocument(document);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(document);
      }
    });

    it('validateDocument should catch invalid document ID', () => {
      const document = createEmptyDocument('test.pdf');
      const invalidDocument = { ...document, id: '' };
      const result = validateDocument(invalidDocument);

      expect(result.success).toBe(false);
    });
  });

  describe('Utility Functions', () => {
    it('hasAnnotations should check for annotations', () => {
      const document = createEmptyDocument('test.pdf');
      expect(hasAnnotations(document)).toBe(false);
    });

    it('hasFormFields should check for form fields', () => {
      const document = createEmptyDocument('test.pdf');
      expect(hasFormFields(document)).toBe(false);
    });

    it('isEncrypted should check encryption status', () => {
      const document = createEmptyDocument('test.pdf');
      expect(isEncrypted(document)).toBe(false);

      const encryptedDoc = updateMetadata(document, { encrypted: true });
      expect(isEncrypted(encryptedDoc)).toBe(true);
    });
  });
});