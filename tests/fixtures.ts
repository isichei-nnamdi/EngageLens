import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export const SAMPLE_NAME = 'UG and PG Project Supervision_ Orientation and Expectations - 2026_10_23 17_52 WAT - Chat.sbv';
export const SAMPLE = readFileSync(fileURLToPath(new URL(`../samples/${SAMPLE_NAME}`, import.meta.url)), 'utf8');
