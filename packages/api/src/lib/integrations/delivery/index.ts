import ky from "ky";
// import { env } from "cloudflare:workers";

const API_URL = process.env.DELIVERY_API_URL;

interface DeliveryZone {
  Id: number;
  zoneName: string;
}

interface Order {
  orderId: number;
  orderNumber: string;
  recipientPhone: string;
  recipientAddressZoneId: number;
  recipientAddress: string;
  deliveryDate: string;
  orderDesc: string;
  senderId: number;
  getMoney: number;
}

interface OrderRequest {
  order: Order;
}
interface OrderResponse {
  orderId: number;
  documentNo: string;
}

const deliveryClient = ky.create({
  prefixUrl: API_URL,
  hooks: {
    beforeRequest: [
      async (request) => {
        const credentials = btoa(
          `${process.env.DELIVERY_USERNAME}:${process.env.DELIVERY_PASSWORD}`,
        );
        request.headers.set("Authorization", `Basic ${credentials}`);
      },
    ],
  },
});

export const getDelivery = async () => {
  console.log({
    API_URL,
    username: process.env.DELIVERY_USERNAME,
    passwordLength: process.env.DELIVERY_PASSWORD?.length,
  });

  const result = await deliveryClient.get("addressZone").json<DeliveryZone>();
  return result;
};

export const createDelivery = async (order: string, phone:number) => {
  const result = await deliveryClient.post("setDelivery",{
    json:{
      order:{
        orderId: crypto.randomUUID(),
        orderNumber: orderNumber,
        recipientPhone: phone+"",
        recipientAddressZoneId: number;
        recipientAddress: string;
        deliveryDate: string;
        orderDesc: string;
        senderId: number;
        getMoney: number;
      }
      }
    }
  });
};
getDelivery();
