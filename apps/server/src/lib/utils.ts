import { customAlphabet } from "nanoid";

export const generateOrderNumber = () => {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    const nanoId = customAlphabet(alphabet);
    return nanoId(10);
  };