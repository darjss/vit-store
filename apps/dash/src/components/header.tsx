// "use client";
import { UserRound, Search } from "lucide-react";
import { SidebarTrigger } from "@workspace/ui/components/sidebar";
import { Suspense } from "react";

import UserData from "./user-data";
import SearchBar from "./search-bar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover";
import Link from "next/link";

const Header = () => {
  return (
    <header className="sticky flex h-16 border-b shadow-sm">
      <div className="sticky flex h-full w-full items-center justify-between px-4">
        <div className="flex items-center gap-2 md:gap-4">
          <SidebarTrigger className="text-gray-500 hover:text-gray-700" />
          <Link href="/">
            <h1 className="text-lg font-semibold text-gray-900 md:text-xl">
              Home
            </h1>
          </Link>
          <Link href="/orders">
            <h1 className="text-lg font-semibold text-gray-900 md:text-xl">
              Orders
            </h1>
          </Link>
          <Link href="/products">
            <h1 className="text-lg font-semibold text-gray-900 md:text-xl">
              Products
            </h1>
          </Link>
        </div>

        {/* Desktop Search bar */}
        <div className="hidden w-96 md:block">
          <SearchBar />
        </div>

        <div className="flex items-center gap-2">
          {/* Mobile Search Popover */}
          <Popover>
            <PopoverTrigger asChild className="md:hidden">
              <button
                aria-label="Search"
                className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200"
              >
                <Search className="h-5 w-5 text-gray-600" />
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-screen max-w-sm p-4">
              <h4 className="mb-4 text-lg font-medium">Search Orders</h4>
              <SearchBar />
            </PopoverContent>
          </Popover>

          {/* User Menu */}
          <Popover>
            <PopoverTrigger>
              <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-100 hover:bg-gray-200">
                <UserRound className="h-5 w-5 text-gray-600" />
              </div>
            </PopoverTrigger>
            <PopoverContent className="w-56">
              <Suspense
                fallback={
                  <div className="p-4 text-center text-gray-500">
                    Loading...
                  </div>
                }
              >
                {process.env.NODE_ENV !== "development" && <UserData />}
              </Suspense>
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </header>
  );
};

export default Header;
