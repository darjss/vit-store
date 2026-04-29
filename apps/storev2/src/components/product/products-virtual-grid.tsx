import { For } from "solid-js";
import ProductCard from "./product-card";

type Product = Parameters<typeof ProductCard>[0]["product"];

type ProductsVirtualGridProps = {
	rows: Product[][];
	rangeStart: number;
	rowHeight: number;
	totalHeight: number;
	setGridRef: (element: HTMLDivElement) => void;
	setFirstRowRef: (element: HTMLDivElement) => void;
};

export function ProductsVirtualGrid(props: ProductsVirtualGridProps) {
	return (
		<div ref={props.setGridRef} class="relative w-full">
			<div style={{ height: `${props.totalHeight}px` }}>
				<For each={props.rows}>
					{(row, rowIndex) => {
						const actualRowIndex = () => props.rangeStart + rowIndex();
						return (
							<div
								ref={rowIndex() === 0 ? props.setFirstRowRef : undefined}
								class="absolute top-0 left-0 grid w-full grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3 lg:gap-4 xl:grid-cols-4"
								style={{
									transform: `translateY(${actualRowIndex() * props.rowHeight}px)`,
								}}
							>
								<For each={row}>{(product) => <ProductCard product={product} />}</For>
							</div>
						);
					}}
				</For>
			</div>
		</div>
	);
}
