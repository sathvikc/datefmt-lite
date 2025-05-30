import { MONTH_NAMES, DEFAULT_HANDLERS } from '../src/handlers.js';

describe('DEFAULT_HANDLERS and MONTH_NAMES', () => {
  it('should have 12 entries in MONTH_NAMES', () => {
    expect(MONTH_NAMES).toHaveLength(12);
  });

  it('should list January first and December last in MONTH_NAMES', () => {
    expect(MONTH_NAMES[0]).toBe('January');
    expect(MONTH_NAMES[11]).toBe('December');
  });

  describe('yyyy handler', () => {
    const fn = DEFAULT_HANDLERS.yyyy;

    it('should pad single-digit years to 4 digits', () => {
      expect(fn({ year: 1 })).toBe('0001');
      expect(fn({ year: 9 })).toBe('0009');
    });

    it('should leave 4-digit years intact', () => {
      expect(fn({ year: 2025 })).toBe('2025');
    });

    it('should handle years longer than 4 digits without trimming', () => {
      expect(fn({ year: 12345 })).toBe('12345');
    });
  });

  describe('yy handler', () => {
    const fn = DEFAULT_HANDLERS.yy;

    it('should return single-digit years without leading zero', () => {
      expect(fn({ year: 5 })).toBe('5');
    });

    it('should return the last two digits of the year', () => {
      expect(fn({ year: 25 })).toBe('25');
      expect(fn({ year: 2025 })).toBe('25');
      expect(fn({ year: 1999 })).toBe('99');
    });
  });

  describe('MMMM and MMM handlers', () => {
    const full = DEFAULT_HANDLERS.MMMM;
    const abbr = DEFAULT_HANDLERS.MMM;

    for (let i = 1; i <= 12; i++) {
      const name = MONTH_NAMES[i - 1];
      it(`should return "${name}" for MMMM when month=${i}`, () => {
        expect(full({ month: i })).toBe(name);
      });
      it(`should return "${name.slice(0, 3)}" for MMM when month=${i}`, () => {
        expect(abbr({ month: i })).toBe(name.slice(0, 3));
      });
    }
  });

  describe('MM and M handlers', () => {
    const fnMM = DEFAULT_HANDLERS.MM;
    const fnM = DEFAULT_HANDLERS.M;

    it('should pad month to two digits for MM', () => {
      expect(fnMM({ month: 1 })).toBe('01');
      expect(fnMM({ month: 12 })).toBe('12');
    });

    it('should return month without padding for M', () => {
      expect(fnM({ month: 1 })).toBe('1');
      expect(fnM({ month: 12 })).toBe('12');
    });
  });

  describe('dd and d handlers', () => {
    const fnDD = DEFAULT_HANDLERS.dd;
    const fnD = DEFAULT_HANDLERS.d;

    it('should pad day to two digits for dd', () => {
      expect(fnDD({ day: 2 })).toBe('02');
      expect(fnDD({ day: 31 })).toBe('31');
    });

    it('should return day without padding for d', () => {
      expect(fnD({ day: 2 })).toBe('2');
      expect(fnD({ day: 31 })).toBe('31');
    });
  });

  describe('HH and H handlers', () => {
    const fnHH = DEFAULT_HANDLERS.HH;
    const fnH = DEFAULT_HANDLERS.H;

    it('should pad hour to two digits for HH', () => {
      expect(fnHH({ hour: 3 })).toBe('03');
      expect(fnHH({ hour: 23 })).toBe('23');
    });

    it('should return hour without padding for H', () => {
      expect(fnH({ hour: 3 })).toBe('3');
      expect(fnH({ hour: 23 })).toBe('23');
    });
  });

  describe('mm and m handlers', () => {
    const fnmm = DEFAULT_HANDLERS.mm;
    const fnm = DEFAULT_HANDLERS.m;

    it('should pad minute to two digits for mm', () => {
      expect(fnmm({ minute: 4 })).toBe('04');
      expect(fnmm({ minute: 59 })).toBe('59');
    });

    it('should return minute without padding for m', () => {
      expect(fnm({ minute: 4 })).toBe('4');
      expect(fnm({ minute: 59 })).toBe('59');
    });
  });

  describe('ss and s handlers', () => {
    const fnss = DEFAULT_HANDLERS.ss;
    const fns = DEFAULT_HANDLERS.s;

    it('should pad second to two digits for ss', () => {
      expect(fnss({ second: 5 })).toBe('05');
      expect(fnss({ second: 59 })).toBe('59');
    });

    it('should return second without padding for s', () => {
      expect(fns({ second: 5 })).toBe('5');
      expect(fns({ second: 59 })).toBe('59');
    });
  });
});
