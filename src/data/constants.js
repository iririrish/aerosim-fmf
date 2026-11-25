// Physical constants (CODATA 2018 / IAU / WGS-84).
export const KB = 1.380649e-23;        // J/K (exact)
export const AMU = 1.66053906660e-27;  // kg
export const MU_EARTH = 3.986004418e14; // m^3/s^2
export const R_EARTH = 6378137;        // m (WGS-84 equatorial)
export const OMEGA_EARTH = 7.2921159e-5; // rad/s

// Species table. massU: standard atomic weights (IUPAC). d: collision diameter in m.
// dSource 'bird1994' = VHS reference diameters at 273 K, Bird (1994) Table A1.
// dSource 'placeholder' = NOT sourced: shown as an assumption in every result and must be replaced.
export const SPECIES = {
  he: { label: 'He', massU: 4.002602, d: 2.33e-10, dSource: 'bird1994' },
  o:  { label: 'O',  massU: 15.9994, d: 3.0e-10,  dSource: 'placeholder' },
  n2: { label: 'N2', massU: 28.0134, d: 4.17e-10, dSource: 'bird1994' },
  o2: { label: 'O2', massU: 31.9988, d: 4.07e-10, dSource: 'bird1994' },
  ar: { label: 'Ar', massU: 39.948,  d: 4.17e-10, dSource: 'bird1994' },
  h:  { label: 'H',  massU: 1.00794, d: 3.0e-10,  dSource: 'placeholder' },
  n:  { label: 'N',  massU: 14.0067, d: 3.0e-10,  dSource: 'placeholder' },
};
export const speciesMass = (k) => SPECIES[k].massU * AMU;
