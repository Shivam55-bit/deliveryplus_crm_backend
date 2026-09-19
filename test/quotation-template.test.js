import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const quotationTemplatePath = path.join(__dirname, '../src/templates/emails/quotation.html');
const quotationTemplate = fs.readFileSync(quotationTemplatePath, 'utf8');

test('quotation email template does not retain the stale whats included placeholder', () => {
  assert.doesNotMatch(quotationTemplate, /\{\{WHATS_INCLUDED_SECTION\}\}/);
  assert.match(quotationTemplate, /WHAT’S INCLUDED IN YOUR QUOTE|WHAT'S INCLUDED IN YOUR QUOTE/i);
});
