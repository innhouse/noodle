export const colors = {
  bg: '#F8F6F1',
  card: '#FFFFFF',
  ink: '#22262F',
  inkSoft: '#6E7480',
  line: '#E6E2D9',
  primary: '#3F7D58', // greens read as "on plan" without shouting
  primarySoft: '#E7F1EB',
  accent: '#D08A2E',
  accentSoft: '#FAEEDC',
  danger: '#B4423A',
  dangerSoft: '#F7E5E3',

  // Macro colours, reused by every chart and bar so a colour always means the
  // same nutrient wherever it appears.
  protein: '#3F7D58',
  carbs: '#D08A2E',
  fat: '#8A6BB1',
  over: '#B4423A',
};

export const fonts = {
  hero: 40,
  title: 28,
  big: 21,
  body: 17,
  small: 14,
  tiny: 12,
};

export const radius = 16;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 14,
  lg: 20,
  xl: 28,
};

export const confidenceColor = {
  high: colors.primary,
  medium: colors.accent,
  low: colors.danger,
};
