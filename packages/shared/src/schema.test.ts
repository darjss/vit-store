import { describe, expect, test } from "bun:test";
import * as v from "valibot";
import { addBrandSchema, addCategorySchema } from "./schema";

describe("addBrandSchema bannerImage", () => {
	test("empty string passes (mirrors logoUrl behaviour)", () => {
		const result = v.safeParse(addBrandSchema, {
			name: "Acme",
			logoUrl: "",
			bannerImage: "",
		});
		expect(result.success).toBe(true);
	});

	test("undefined passes (optional)", () => {
		const result = v.safeParse(addBrandSchema, {
			name: "Acme",
			logoUrl: "",
		});
		expect(result.success).toBe(true);
	});

	test("null passes (nullable)", () => {
		const result = v.safeParse(addBrandSchema, {
			name: "Acme",
			logoUrl: "",
			bannerImage: null,
		});
		expect(result.success).toBe(true);
	});

	test("valid URL passes", () => {
		const result = v.safeParse(addBrandSchema, {
			name: "Acme",
			logoUrl: "",
			bannerImage: "https://cdn.darjs.dev/brands/acme.webp",
		});
		expect(result.success).toBe(true);
	});

	test("bad URL fails", () => {
		const result = v.safeParse(addBrandSchema, {
			name: "Acme",
			logoUrl: "",
			bannerImage: "not-a-url",
		});
		expect(result.success).toBe(false);
	});
});

describe("addCategorySchema bannerImage", () => {
	test("empty string passes", () => {
		const result = v.safeParse(addCategorySchema, {
			name: "Vitamins",
			bannerImage: "",
		});
		expect(result.success).toBe(true);
	});

	test("null passes (nullable)", () => {
		const result = v.safeParse(addCategorySchema, {
			name: "Vitamins",
			bannerImage: null,
		});
		expect(result.success).toBe(true);
	});

	test("bad URL fails", () => {
		const result = v.safeParse(addCategorySchema, {
			name: "Vitamins",
			bannerImage: "not-a-url",
		});
		expect(result.success).toBe(false);
	});
});
