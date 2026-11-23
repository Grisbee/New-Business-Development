import { ThreadEditor } from "@/components/ThreadEditor";
import { requireMe } from "@/lib/me";

export const metadata = { title: "New thread · SideQuest" };

export default async function NewThreadPage() {
  await requireMe();
  return <ThreadEditor />;
}
