import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

const read = (path) => readFile(join(root, path), "utf8");

const [input, mobileButton, overlay] = await Promise.all([
	read("src/components/search/search-input.tsx"),
	read("src/components/search/mobile-search-button.tsx"),
	read("src/components/search/search-overlay.tsx"),
]);

assert.match(
	input,
	/const submittedValue = e\.currentTarget\.value;/,
	"Enter submit should use the live input element value.",
);

assert.match(
	input,
	/local\.onSubmitSearch\?\.\(submittedValue\);/,
	"Enter submit should pass the live input value to onSubmitSearch.",
);

assert.match(
	mobileButton,
	/<SheetTrigger[\s\S]*as="button"[\s\S]*aria-label="Хайх"/,
	"Mobile search should open through SheetTrigger.",
);

assert.match(
	mobileButton,
	/focusKey=\{isOpen\(\)\}/,
	"Mobile search input should refocus when the sheet opens.",
);

assert.match(
	overlay,
	/focusKey=\{isOpen\(\)\}/,
	"Desktop search input should keep the same open-focus behavior.",
);

console.log("search UX QA checks passed");
