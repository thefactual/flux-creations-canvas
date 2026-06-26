import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Hero } from "@/components/creator/Hero";
import { Gallery } from "@/components/creator/Gallery";
import { Plans } from "@/components/creator/Plans";

export default function CreatorProfile() {
  return (
    <div className="min-h-screen bg-white">
      <Header />
      <Hero />
      <Gallery />
      <Plans />
      <Footer />
    </div>
  );
}
