export default function ThemeToggle() {
  const toggle = () => {
    document.documentElement.classList.toggle("dark");
  };

  return (
    <button
      onClick={toggle}
      className="px-3 py-1 rounded border dark:border-gray-600"
    >
      🌙 / ☀️
    </button>
  );
}
