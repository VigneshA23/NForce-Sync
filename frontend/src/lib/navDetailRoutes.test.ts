import { describe, expect, it } from 'vitest';
import { navPathFor } from './nav';

describe('navPathFor', () => {
  it('maps a Team EOD Status detail URL back to its sidebar parent, so the route guard allows it', () => {
    expect(navPathFor('/my-reports/eod-status/167')).toBe('/my-reports/eod-status');
  });

  it('leaves ordinary and non-matching paths untouched', () => {
    expect(navPathFor('/my-reports/eod-status')).toBe('/my-reports/eod-status');
    expect(navPathFor('/my-reports/overview')).toBe('/my-reports/overview');
    expect(navPathFor('/my-reports/eod-status/abc')).toBe('/my-reports/eod-status/abc');
    expect(navPathFor('/my-reports/eod-status/167/extra')).toBe('/my-reports/eod-status/167/extra');
  });
});
