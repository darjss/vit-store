import { BillListIcon } from "@solar-icons/solid/linear/bill-list";
import { BoxIcon } from "@solar-icons/solid/linear/box";
import { ChartIcon } from "@solar-icons/solid/linear/chart";
import { HomeSmileIcon } from "@solar-icons/solid/linear/home-smile";
import type { JSX } from "solid-js";

// The four sections, in one order, used by both the mobile bottom nav and the
// desktop top nav. Desktop expands the layout, never the information order.
export interface NavItem {
	to: string;
	label: string;
	icon: () => JSX.Element;
}

export const NAV_ITEMS: NavItem[] = [
	{ to: "/", label: "Нүүр", icon: () => <HomeSmileIcon /> },
	{ to: "/products", label: "Бараа", icon: () => <BoxIcon /> },
	{ to: "/orders", label: "Захиалга", icon: () => <BillListIcon /> },
	{ to: "/analytics", label: "Шинжилгээ", icon: () => <ChartIcon /> },
];

export function isNavActive(pathname: string, to: string): boolean {
	if (to === "/") return pathname === "/";
	return pathname === to || pathname.startsWith(`${to}/`);
}
