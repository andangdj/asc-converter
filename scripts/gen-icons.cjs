// Generate Tauri icons from SVG or PNG source
const { Resvg } = require("@resvg/resvg-js");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

async function main() {
  const inputFile = process.argv[2] || path.join(__dirname, "..", "public", "logo.svg");
  const inputPath = path.resolve(inputFile);
  
  if (!fs.existsSync(inputPath)) {
    console.error(`File not found: ${inputPath}`);
    process.exit(1);
  }

  const ext = path.extname(inputPath).toLowerCase();
  let pngPath;

  if (ext === ".svg") {
    console.log("Converting SVG to 1024x1024 PNG...");
    const svgContent = fs.readFileSync(inputPath, "utf-8");
    const resvg = new Resvg(svgContent, {
      fitTo: { mode: "width", value: 1024 },
      background: "transparent",
    });
    const pngData = resvg.render();
    pngPath = path.join(path.dirname(inputPath), "icon-source.png");
    fs.writeFileSync(pngPath, pngData.asPng());
    console.log(`Written: ${pngPath}`);
  } else if (ext === ".png") {
    pngPath = inputPath;
    console.log(`Using PNG: ${pngPath}`);
  } else {
    console.error("Input must be .svg or .png");
    process.exit(1);
  }

  console.log("Generating all Tauri icon formats...");
  execSync(`npx tauri icon "${pngPath}"`, {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
  });

  console.log("\n✅ Icons generated! Rebuild the app to see the changes.");
}

main().catch((err) => {
  console.error("Error:", err.message);
  process.exit(1);
});
