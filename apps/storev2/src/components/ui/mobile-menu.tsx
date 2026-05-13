import type { Component, JSX } from "solid-js";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import IconMenu from "~icons/ri/menu-line";

interface MobileMenuProps {
  children: JSX.Element;
}

const MobileMenu: Component<MobileMenuProps> = (props) => {
  return (
    <Sheet>
      <SheetTrigger class=" p-2 border-[3px] border-border bg-background shadow-hard-sm hover:bg-primary hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all">
        <IconMenu class="w-6 h-6" />
        <span class="sr-only">Toggle menu</span>
      </SheetTrigger>
      <SheetContent position="left" class="w-[300px] sm:w-[400px] border-r-4 border-border p-0">
        <div class="h-full overflow-y-auto bg-background">
            {props.children}
        </div>
      </SheetContent>
    </Sheet>
  );
};

export default MobileMenu;
