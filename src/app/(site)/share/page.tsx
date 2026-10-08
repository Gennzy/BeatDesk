import { redirect } from "next/navigation";

/** Прежний адрес каналов. Переехали в кабинет битмейкера: /cabinet/channels. */
export default function ShareRedirect() {
  redirect("/cabinet/channels");
}