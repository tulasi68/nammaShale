export const institutionConfig = {
  name: "NammaShale",
  nameKannada: "ನಮ್ಮಶಾಲೆ",
  shortName: "ನ",
  tagline: "Our School. Our Responsibility. Our Future.",
  primaryColor: "#047857",
  localeDefault: "en" as const,
  supportedLocales: ["en", "kn"] as const,
  modules: { school: true, students: true, attendance: true, academics: true, alumni: true, javabdari: true, partnerships: true, teachers: true, notices: true, events: true },
};
export type InstitutionConfig = typeof institutionConfig;
