import { describe, expect, test } from "bun:test";
import { extractProductImageIds } from "../../src/lib/ai-product/amazon-html";
import {
	productTitleMatchesBrand,
	productTitleMatchesQuery,
} from "../../src/lib/ai-product/amazon-url";

describe("extractProductImageIds", () => {
	test("uses only the active product gallery", () => {
		const html = `
			<script>
				P.when('A').register('ImageBlockATF', function(A){
					var data = {'colorImages': {'initial': [
						{"hiRes":"https://m.media-amazon.com/images/I/71RIGHTFRONT._AC_SL1500_.jpg","main":{"x":"https://m.media-amazon.com/images/I/71RIGHTFRONT._AC_.jpg"}},
						{"large":"https://m.media-amazon.com/images/I/72RIGHTLABEL._AC_SL1500_.jpg"}
					]}};
				});
			</script>
			<div id="sponsored-products">
				<img src="https://m.media-amazon.com/images/I/79MICROD310000._AC_SL1500_.jpg">
			</div>
		`;

		expect(extractProductImageIds(html)).toEqual([
			"71RIGHTFRONT",
			"72RIGHTLABEL",
		]);
	});

	test("reads gallery URLs stored as main object keys", () => {
		const html = `
			<script>
				var data = {'colorImages': {'initial': [
					{"main":{"https://m.media-amazon.com/images/I/73MAINONLY._AC_SY879_.jpg":[679,879]}}
				]}};
			</script>
		`;

		expect(extractProductImageIds(html)).toEqual(["73MAINONLY"]);
	});

	test("falls back only to the landing image", () => {
		const html = `
			<img class="a-dynamic-image" id="landingImage"
				data-old-hires="https://m.media-amazon.com/images/I/81RIGHTPRODUCT._AC_SL1500_.jpg"
				src="https://m.media-amazon.com/images/I/81RIGHTPRODUCT._AC_SX679_.jpg">
			<div id="recommendations">
				<img data-old-hires="https://m.media-amazon.com/images/I/89WRONGPRODUCT._AC_SL1500_.jpg">
			</div>
		`;

		expect(extractProductImageIds(html)).toEqual(["81RIGHTPRODUCT"]);
	});

	test("returns no recommendation images when product data is absent", () => {
		const html = `
			<div id="recommendations">
				<img src="https://m.media-amazon.com/images/I/79MICROD310000._AC_SL1500_.jpg">
			</div>
		`;

		expect(extractProductImageIds(html)).toEqual([]);
	});
});

describe("productTitleMatchesQuery", () => {
	test("accepts the same product", () => {
		expect(
			productTitleMatchesQuery(
				"Micro Ingredients Vitamin D3 10,000 IU + K2 MK-7 200 mcg 300 Softgels",
				"Micro Ingredients Vitamin D3 10,000 IU + K2 (MK-7) 200 mcg, 300 Softgels",
			),
		).toBe(true);
	});

	test("accepts common dose and vitamin spelling variants", () => {
		expect(
			productTitleMatchesQuery(
				"NOW Vitamin D3 10000 IU 240 Veggie Capsules",
				"NOW Vitamin D-3 10,000 IU, 240 Capsules",
			),
		).toBe(true);
	});

	test("rejects a different brand with the same variant", () => {
		expect(
			productTitleMatchesQuery(
				"Micro Ingredients Vitamin D3 5,000 IU + K2 MK-7 100 mcg 300 Softgels",
				"NatureBell Vitamin D3 5,000 IU + K2 MK-7 100 mcg 300 Softgels",
			),
		).toBe(false);
	});

	test("rejects brands that share their first word", () => {
		expect(
			productTitleMatchesQuery(
				"Nature's Bounty Magnesium 500 mg 120 Capsules",
				"Nature's Nutrition Magnesium 500 mg 120 Capsules",
			),
		).toBe(false);
	});

	test("rejects extra active vitamin variants", () => {
		expect(
			productTitleMatchesQuery(
				"Micro Ingredients Vitamin D3 10,000 IU 300 Softgels",
				"Micro Ingredients Vitamin D3 10,000 IU + K2 MK-7 300 Softgels",
			),
		).toBe(false);
	});

	test("checks every word in an expected brand", () => {
		expect(
			productTitleMatchesBrand(
				"Nature's Nutrition Magnesium 500 mg",
				"Nature's Bounty",
			),
		).toBe(false);
	});

	test("rejects a different D3 dose", () => {
		expect(
			productTitleMatchesQuery(
				"Micro Ingredients Vitamin D3 2,000 IU + K2 MK-7 50 mcg 300 Softgels",
				"Micro Ingredients Vitamin D3 10,000 IU + K2 MK-7 200 mcg, 300 Softgels",
			),
		).toBe(false);
	});

	test("rejects D3 when K2 MK-7 was requested", () => {
		expect(
			productTitleMatchesQuery(
				"Micro Ingredients Vitamin K2 MK-7 200 mcg 300 Softgels",
				"Micro Ingredients Vitamin D3 10,000 IU 300 Softgels",
			),
		).toBe(false);
	});
});
