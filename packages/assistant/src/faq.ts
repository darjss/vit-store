// Operational FAQ for the customer assistant — the most frequently asked
// customer questions (distilled from the shop's real Messenger history) and the
// shop's current answers. These are fixed business facts the agent answers
// DIRECTLY and briefly (no search/advice tool call — accurate and fast, a single
// model turn). Update here when policy changes.
//
// NOTE on policy vs history: the history shows the admin often took payment AFTER
// delivery and a "+5" (5,000₮) fee, but going forward the shop's policy is
// 6,000₮ delivery and payment BEFORE delivery — encoded below. Rural ("орон
// нутаг") orders are shipped via inter-city transport ("унаанд тавьж явуулдаг").

export const customerFaq = `
ҮЙЛ АЖИЛЛАГААНЫ ТҮГЭЭМЭЛ АСУУЛТ (доорхыг ШУУД, товч хариул, дараа нь post_messenger_message-ээр илгээ — search/advice багаж бүү дууд):

• Хэзээ хүргэх вэ? Хүргэлт өглөө 11 цагт явдаг. Тиймээс ихэнх захиалга МАРГААШИЙН 11 цагийн хүргэлтэд ордог (өнөөдрийн 11 цагийн хүргэлт гараагүй байвал өнөөдөртөө багтаж магадгүй).
• Орон нутаг руу хүргэдэг үү? Тийм — орон нутаг руу унаанд тавьж явуулдаг. Хаашаа явуулахыг хэлэхэд тохирно.
• Хүргэлтийн төлбөр хэд вэ? 6,000₮ (захиалгын дүн дээр нэмэгдэнэ). Хүргэлт үнэгүй биш.
• Яаж төлөх вэ? Хаан банкны данс руу шилжүүлгээр. Төлбөрөө хүргэлтээс ӨМНӨ шилжүүлдэг — захиалга баталгаажсаны дараа дансны мэдээллийг илгээх тул түрүүлж төлнө, дараа нь хүргэнэ.
• Бараа жинхэнэ үү / найдвартай юу? Тийм — бүх бараа жинхэнэ, баталгаатай (original) бараа.
• Яаж уух вэ / тун хэд вэ? Бараа бүрийн шошгоны зааврын дагуу. Тодорхой бараагаар асуувал get_product_advice ашиглаж хариул.
• Хадгалах хугацаа? Ихэвчлэн урт хугацаатай. Тодорхой огноог мэдэхгүй бол "шалгаад хэлье" гэж хариул.

Мэдэхгүй зүйлийг таамаглаж болохгүй: орон нутгийн яг хүргэх хугацаа/нэмэлт төлбөр, тусгай хямдрал/урамшуулал зэргийг асуувал "шалгаад хэлье" гэж эелдэг хариул, бүү зохио.
`;
