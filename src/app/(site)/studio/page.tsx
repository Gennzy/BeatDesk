import { redirect } from "next/navigation";

/** Прежний адрес студии. Переехала в кабинет битмейкера: /cabinet/studio. */
export default function StudioRedirect() {
  redirect("/cabinet/studio");
}