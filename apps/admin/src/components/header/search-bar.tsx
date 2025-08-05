import { Button } from "../ui/button";
import { Input } from "../ui/input";
import { Search } from "lucide-react";

const SearchBar = () => {
  return (
    <div className="flex items-center gap-2">
      <Input type="text" placeholder="Search" />
      <Button
        onClick={() => {
          console.log("search");
        }}
      >
        <Search className="h-4 w-4" />
      </Button>
    </div>
  );
};
export default SearchBar;
