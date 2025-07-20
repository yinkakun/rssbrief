/** @type {import('prettier').Config} */
const config = {
  semi: true,
  tabWidth: 2,
  printWidth: 120,
  singleQuote: true,
  trailingComma: "all",
  tailwindFunctions: ["cn"],
  plugins: ["prettier-plugin-tailwindcss"],
};

export default config;
