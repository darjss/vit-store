// Operational FAQ distilled from the shop's real Messenger history (the most
// frequently asked customer questions and the admin's actual answers). These are
// fixed business facts the agent should answer DIRECTLY and briefly — without a
// search/advice tool call — which is both accurate and fast (a single model
// turn, no extra round-trips). Update here when shop policy changes.
//
// Evidence from history (occurrence counts): "Маргааш хүргэнэ" / next-day
// delivery ~495×; delivery fee "+5" / "Hurgelt 5" = 5,000₮; bank transfer to
// Khan Bank (Batdelger) is the dominant payment, paid after delivery; products
// affirmed as genuine/original. Rural delivery, same-day cutoff time, and bulk
// discounts were inconsistent/rare — the agent must NOT invent those.

export const customerFaq = `
ҮЙЛ АЖИЛЛАГААНЫ ТҮГЭЭМЭЛ АСУУЛТ (доорхыг ШУУД, товч хариул — багаж дуудах шаардлагагүй):

• Хэзээ хүргэх вэ? Улаанбаатар хотод ихэвчлэн МАРГААШ нь хүргэдэг. Тухайн өдрийн хүргэлт гараагүй байвал өнөөдөртөө хүрэх боломжтой.
• Хүргэлтийн төлбөр хэд вэ? 5,000₮ (захиалгын дүн дээр нэмэгдэнэ). Хүргэлт үнэгүй биш.
• Яаж төлөх вэ? Хаан банкны данс руу шилжүүлгээр төлдөг. Ихэвчлэн бараагаа хүлээн авсны дараа шилжүүлдэг; захиалга баталгаажсаны дараа дансны мэдээллийг илгээнэ.
• Бараа жинхэнэ үү / найдвартай юу? Тийм — бүх бараа жинхэнэ, баталгаатай (original) бараа.
• Яаж уух вэ / тун хэд вэ? Бараа бүрийн шошгоны зааврын дагуу. Тодорхой бараагаар асуувал get_product_advice ашиглаж хариул.
• Хадгалах хугацаа? Ихэвчлэн урт хугацаатай. Тодорхой огноог мэдэхгүй бол "шалгаад хэлье" гэж хариул.

Мэдэхгүй зүйлийг таамаглаж болохгүй: тухайн өдрийн яг хүргэх цаг, орон нутаг (хот хооронд) хүргэлт, тусгай хямдрал/урамшуулал зэргийг асуувал — "шалгаад хэлье" гэж эелдэг хариул, бүү зохио.
`;
