/*
 * @vit/ui — shared Solid primitives for storefront and admin.
 * Kobalte underneath, warm cream tokens, butter primary, status palette
 * without blue or green. See README.md for consumption and theming.
 */

export type { BadgeProps } from "./components/badge";
export { Badge, badgeVariants } from "./components/badge";
export type { ButtonProps, IconButtonProps } from "./components/button";
export { Button, buttonVariants, IconButton } from "./components/button";
export type {
	ComboboxContentProps,
	ComboboxControlProps,
	ComboboxDescriptionProps,
	ComboboxErrorProps,
	ComboboxIconProps,
	ComboboxInputProps,
	ComboboxItemIndicatorProps,
	ComboboxItemLabelProps,
	ComboboxItemProps,
	ComboboxLabelProps,
	ComboboxTriggerProps,
} from "./components/combobox";
export {
	Combobox,
	ComboboxContent,
	ComboboxControl,
	ComboboxDescription,
	ComboboxError,
	ComboboxHiddenSelect,
	ComboboxIcon,
	ComboboxInput,
	ComboboxItem,
	ComboboxItemIndicator,
	ComboboxItemLabel,
	ComboboxLabel,
	ComboboxTrigger,
} from "./components/combobox";
export type {
	DialogCloseButtonProps,
	DialogContentProps,
	DialogDescriptionProps,
	DialogFooterProps,
	DialogHeaderProps,
	DialogOverlayProps,
	DialogTitleProps,
} from "./components/dialog";
export {
	Dialog,
	DialogCloseButton,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
} from "./components/dialog";
export type {
	DrawerContentProps,
	DrawerDescriptionProps,
	DrawerFooterProps,
	DrawerHeaderProps,
	DrawerOverlayProps,
	DrawerTitleProps,
} from "./components/drawer";
export {
	Drawer,
	DrawerClose,
	DrawerContent,
	DrawerDescription,
	DrawerFooter,
	DrawerHeader,
	DrawerOverlay,
	DrawerPortal,
	DrawerTitle,
	DrawerTrigger,
} from "./components/drawer";
export type { EmptyStateProps } from "./components/empty-state";
export { EmptyState } from "./components/empty-state";
export type { FieldProps } from "./components/field";
export { Field } from "./components/field";
export type { FormSectionProps } from "./components/form-section";
export { FormSection } from "./components/form-section";
export type { InlineAlertProps } from "./components/inline-alert";
export { InlineAlert, inlineAlertVariants } from "./components/inline-alert";
export type {
	InputDescriptionProps,
	InputErrorProps,
	InputLabelProps,
	InputProps,
	InputRootProps,
	TextAreaProps,
} from "./components/input";
export {
	Input,
	InputDescription,
	InputError,
	InputLabel,
	InputRoot,
	TextArea,
} from "./components/input";
export type {
	MenuCheckboxItemProps,
	MenuContentProps,
	MenuGroupLabelProps,
	MenuItemLabelProps,
	MenuItemProps,
	MenuRadioItemProps,
	MenuSeparatorProps,
	MenuSubContentProps,
	MenuSubTriggerProps,
} from "./components/menu";
export {
	Menu,
	MenuCheckboxItem,
	MenuContent,
	MenuGroup,
	MenuGroupLabel,
	MenuItem,
	MenuItemLabel,
	MenuLabel,
	MenuPortal,
	MenuRadioGroup,
	MenuRadioItem,
	MenuSeparator,
	MenuShortcut,
	MenuSub,
	MenuSubContent,
	MenuSubTrigger,
	MenuTrigger,
} from "./components/menu";
export type {
	SelectContentProps,
	SelectDescriptionProps,
	SelectErrorProps,
	SelectItemProps,
	SelectLabelProps,
	SelectTriggerProps,
} from "./components/select";
export {
	Select,
	SelectContent,
	SelectDescription,
	SelectError,
	SelectHiddenSelect,
	SelectItem,
	SelectLabel,
	SelectTrigger,
	SelectValue,
} from "./components/select";
export type { SkeletonProps } from "./components/skeleton";
export { Skeleton } from "./components/skeleton";
export type {
	TabsContentProps,
	TabsListProps,
	TabsTriggerProps,
} from "./components/tabs";
export { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/tabs";
export type {
	ToastCloseProps,
	ToastDescriptionProps,
	ToasterProps,
	ToastRootProps,
	ToastTitleProps,
	ToastVariant,
} from "./components/toast";
export {
	showToast,
	showToastPromise,
	Toast,
	ToastClose,
	ToastDescription,
	Toaster,
	ToastTitle,
} from "./components/toast";
export { cn } from "./lib/cn";
