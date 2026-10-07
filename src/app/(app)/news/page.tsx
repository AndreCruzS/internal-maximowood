import { Newspaper } from "lucide-react";
import ComingSoon from "@/components/ComingSoon";

export const metadata = { title: "News · GMX Group Intranet" };

export default function NewsPage() {
  return <ComingSoon icon={Newspaper} title="News" text="Company and department announcements are coming soon." />;
}
