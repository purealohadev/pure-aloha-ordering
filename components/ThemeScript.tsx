const themeScript = `
(() => {
  try {
    const theme = window.localStorage.getItem("pure-aloha-theme") === "light" ? "light" : "dark";
    document.documentElement.classList.toggle("dark", theme === "dark");
    document.documentElement.classList.toggle("light", theme === "light");
    document.documentElement.style.colorScheme = theme;
  } catch {
    document.documentElement.classList.add("dark");
    document.documentElement.style.colorScheme = "dark";
  }
})();
`;

export default function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: themeScript }} />;
}
