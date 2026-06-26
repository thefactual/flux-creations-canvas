import { ProfileHeader } from "@/components/creator/ProfileHeader";
import { ContentGrid } from "@/components/creator/ContentGrid";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";

export default function CreatorProfile() {
  return (
    <div className="min-h-screen">
      <Header />
      <ProfileHeader />
      <ContentGrid />
      <Footer />
    </div>
  );
}
