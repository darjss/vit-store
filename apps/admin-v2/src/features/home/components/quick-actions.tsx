/*
 * Quick actions — pinned at Шинэ бараа · Захиалга нэмэх · Нөөц нэмэх ·
 * Дэлгүүр урьдчилан харах. The first three navigate inside the app; the
 * store preview opens the public storefront from VITE_STORE_URL (fallback
 * https://vitstore.dev — flagged for the integrator to confirm).
 */

import { AddSquareIcon } from "@solar-icons/solid/linear/add-square";
import { BagIcon } from "@solar-icons/solid/linear/bag";
import { BoxMinimalisticIcon } from "@solar-icons/solid/linear/box-minimalistic";
import { ShopIcon } from "@solar-icons/solid/linear/shop";
import { Link } from "@tanstack/solid-router";
import type { JSX } from "solid-js";

const STORE_URL = import.meta.env.VITE_STORE_URL ?? "https://vitstore.dev";

const actionClass =
	"flex min-h-11 items-center gap-2.5 rounded-2xl border border-rule bg-surface p-3.5 font-bold text-[13px] leading-snug shadow-card transition-colors duration-150 hover:bg-surface-2/60 focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2";

function ActionIcon(props: { icon: JSX.Element }) {
	return (
		<span
			class="grid size-9 shrink-0 place-items-center rounded-[9px] bg-surface-2 text-ink"
			aria-hidden="true"
		>
			{props.icon}
		</span>
	);
}

export function QuickActions() {
	return (
		<section aria-label="Шуурхай үйлдэл">
			<h2 class="mb-2 font-extrabold text-[15px]">Шуурхай үйлдэл</h2>
			<div class="grid grid-cols-2 gap-2.5">
				<Link to="/products" class={actionClass}>
					<ActionIcon icon={<AddSquareIcon class="size-5" />} />
					<span>Шинэ бараа</span>
				</Link>
				<Link to="/orders" class={actionClass}>
					<ActionIcon icon={<BagIcon class="size-5" />} />
					<span>Захиалга нэмэх</span>
				</Link>
				<Link to="/products" class={actionClass}>
					<ActionIcon icon={<BoxMinimalisticIcon class="size-5" />} />
					<span>Нөөц нэмэх</span>
				</Link>
				<a
					href={STORE_URL}
					target="_blank"
					rel="noopener noreferrer"
					class={actionClass}
				>
					<ActionIcon icon={<ShopIcon class="size-5" />} />
					<span>Дэлгүүр урьдчилан харах</span>
				</a>
			</div>
		</section>
	);
}
