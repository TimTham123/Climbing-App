import { describe, expect, it } from 'vitest';
import { GRADES, gradeLabel, normaliseGrade, parseGrade } from '../../src/lib/grades';

describe('gym colour grades', () => {
  it('runs easy to hard in the gym order', () => {
    expect(GRADES.map(gradeLabel)).toEqual(['Yellow', 'Blue', 'Purple', 'Green', 'Orange', 'Red', 'Black', 'White']);
  });
  it('parses names and clamps out-of-range numbers', () => {
    expect(parseGrade('black')).toBe(6);
    expect(parseGrade('V5')).toBeNull();
    expect(normaliseGrade(-1)).toBe(0);
    expect(normaliseGrade(12)).toBe(7);
    expect(gradeLabel(null)).toBe('—');
  });
});
