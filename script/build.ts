import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { rm, readFile } from "fs/promises";

const nativeModules: string[] = [];

const clientOnlyPrefixes = [
  "@radix-ui/",
  "@hookform/",
  "@tanstack/",
  "react",
  "react-dom",
  "wouter",
  "lucide-react",
  "framer-motion",
  "class-variance-authority",
  "clsx",
  "cmdk",
  "embla-carousel",
  "input-otp",
  "next-themes",
  "react-day-picker",
  "react-hook-form",
  "react-icons",
  "react-resizable-panels",
  "recharts",
  "tailwind-merge",
  "tailwindcss-animate",
  "tw-animate-css",
  "vaul",
];

const devOnly = [
  "@replit/",
  "@tailwindcss/",
  "@types/",
  "@vitejs/",
  "autoprefixer",
  "drizzle-kit",
  "esbuild",
  "postcss",
  "tailwindcss",
  "tsx",
  "typescript",
  "vite",
];

async function buildAll() {
  await rm("dist", { recursive: true, force: true });

  console.log("building client...");
  await viteBuild();

  console.log("building server...");
  const pkg = JSON.parse(await readFile("package.json", "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];

  const isExcluded = (dep: string) => {
    if (nativeModules.includes(dep)) return true;
    for (const prefix of [...clientOnlyPrefixes, ...devOnly]) {
      if (dep.startsWith(prefix)) return true;
    }
    return false;
  };

  const externals = allDeps.filter(isExcluded);
  console.log("externals (not bundled):", externals);

  await esbuild({
    entryPoints: ["server/index.ts"],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: "dist/index.cjs",
    define: {
      "process.env.NODE_ENV": '"production"',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
