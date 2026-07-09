"use client";

import { Suspense, useState, useCallback, useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import Header, { TabId } from "@/components/Header";
import Panel from "@/components/Panel";
import dynamic from "next/dynamic";
import { useConstituency, withConstituency, type ConstituencySlug } from "@/hooks/useConstituency";

const ConstituencyMap = dynamic(() => import("@/components/ConstituencyMap"), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full text-zinc-600 text-[0.611rem] uppercase tracking-wider">
      Initialising map…
    </div>
  ),
});
import ElectoralIntel from "@/components/ElectoralIntel";
import Demographics from "@/components/Demographics";
import NewsFeed from "@/components/NewsFeed";
import FixMyStreet from "@/components/FixMyStreet";
import ConstituencyProfile from "@/components/ConstituencyProfile";
import ParliamentBills from "@/components/ParliamentBills";
import HansardFeed from "@/components/HansardFeed";
import AIBrief from "@/components/AIBrief";
import TrendsPanel from "@/components/TrendsPanel";
import Headlines from "@/components/Headlines";
import LiveFeeds from "@/components/LiveFeeds";
import OppositionTracker from "@/components/OppositionTracker";
import WardDataHub from "@/components/WardDataHub";
import PageSkeleton from "@/components/ui/PageSkeleton";
import LeafletsPanel from "@/components/LeafletsPanel";
import MentionsFeed from "@/components/MentionsFeed";
import ActivityCharts from "@/components/ActivityCharts";
import PollingDashboard from "@/components/PollingDashboard";
import SchoolsPanel from "@/components/SchoolsPanel";
import HealthPanel from "@/components/HealthPanel";
import EmploymentPanel from "@/components/EmploymentPanel";
import HousePricesPanel from "@/components/HousePricesPanel";
import UniversalCreditPanel from "@/components/UniversalCreditPanel";
import EPCPanel from "@/components/EPCPanel";
import CQCPanel from "@/components/CQCPanel";
import PetitionsPanel from "@/components/PetitionsPanel";
import CommonsLibraryPanel from "@/components/CommonsLibraryPanel";
import {
  Map,
  Newspaper,
  Vote,
  BarChart3,
  AlertTriangle,
  Users,
  Landmark,
  BookOpen,
  Brain,
  TrendingUp,
  FileText,
  Tv,
  Shield,
  AtSign,
  GraduationCap,
  HeartPulse,
  Briefcase,
  Activity,
  PieChart,
  Home,
  CreditCard,
  Zap,
  Stethoscope,
  LayoutGrid,
  Camera,
} from "lucide-react";

export default function DashboardPage() {
  // useSearchParams must be wrapped in Suspense in the App Router.
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Dashboard />
    </Suspense>
  );
}

function formatCachedAt(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const tsDayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const timeStr = d.toLocaleTimeString("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
  if (tsDayStart === todayStart) {
    return d.getHours() < 12 ? `Data from this morning, ${timeStr}` : `Data from today, ${timeStr}`;
  }
  if (tsDayStart === todayStart - 86400000) {
    return `Data from yesterday, ${timeStr}`;
  }
  return `Data from ${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${timeStr}`;
}

function Dashboard() {
  const [activeTab, setActiveTab] = useState<TabId>("map");
  const { slug: constituencySlug, name: constituencyName, options, loading } = useConstituency();
  const router = useRouter();
  const pathname = usePathname();
  const [dataCachedAt, setDataCachedAt] = useState<number | null>(null);

  useEffect(() => {
    setDataCachedAt(null);
    if (!constituencySlug) return;
    fetch(withConstituency("/api/employment", constituencySlug))
      .then(r => r.json())
      .then((d: { _cachedAt?: number }) => { if (d._cachedAt) setDataCachedAt(d._cachedAt); })
      .catch(() => {});
  }, [constituencySlug]);

  const handleConstituencyChange = useCallback(
    (next: ConstituencySlug) => {
      // Persist selection in URL so the page is shareable. Components read
      // the slug from URL via the useConstituency hook and will re-fetch
      // when their useEffect dependencies update.
      const qs = new URLSearchParams(window.location.search);
      qs.set("constituency", next);
      router.replace(`${pathname}?${qs.toString()}`);
    },
    [router, pathname]
  );

  // No constituencies assigned → render a clean empty state instead of broken
  // panels that all 401/403. Loading also shows a placeholder.
  if (loading) {
    return <PageSkeleton />;
  }
  if (options.length === 0) {
    return (
      <div data-component="dashboardNoAccess" className="min-h-screen bg-[#0a0a0a] text-zinc-200 flex flex-col">
        <Header
          activeTab={activeTab}
          onTabChange={setActiveTab}
          constituencySlug=""
          onConstituencyChange={handleConstituencyChange}
          options={options}
        />
        <main className="flex-1 flex items-center justify-center px-4">
          <div data-component="noAccessCard" className="max-w-sm text-center border border-[#2a2a2a] bg-[#141414] p-8">
            <p className="text-[0.611rem] uppercase tracking-wider text-zinc-500 mb-2">
              No access
            </p>
            <p className="text-sm text-zinc-300 mb-2">
              No constituencies assigned to your account.
            </p>
            <p className="text-xs text-zinc-600">
              Contact your administrator to be granted access to one or more constituencies.
            </p>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div data-component="dashboardRoot" className="min-h-screen bg-background flex flex-col">
      <Header
        activeTab={activeTab}
        onTabChange={setActiveTab}
        constituencySlug={constituencySlug}
        onConstituencyChange={handleConstituencyChange}
        options={options}
      />

      {dataCachedAt !== null && (
        <div className="px-4 py-1 border-b border-border">
          <span className="text-[10px] text-zinc-600">{formatCachedAt(dataCachedAt)}</span>
        </div>
      )}

      <main data-component="dashboardMain" className="flex-1 p-2 lg:p-3">
        <div data-component="dashboardGridContainer" className="max-w-[1800px] mx-auto">

          {/* ═══ MAP TAB ═══ */}
          {activeTab === "map" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Map — dominant panel */}
              <Panel
                title="Constituency Map"
                dataComponent="constituencyMap"
                icon={<Map className="h-3.5 w-3.5" />}
                className="lg:col-span-8 lg:row-span-2 min-h-[25rem] lg:min-h-[36.111rem]"
              >
                <ConstituencyMap />
              </Panel>

              {/* Profile sidebar */}
              <Panel
                title={constituencyName}
                dataComponent="constituencyProfileSidebar"
                icon={<Users className="h-3.5 w-3.5" />}
                className="lg:col-span-4"
              >
                <ConstituencyProfile />
              </Panel>

              {/* Electoral Intelligence */}
              <Panel
                title="Electoral Intelligence"
                dataComponent="electoralIntelligence"
                icon={<Vote className="h-3.5 w-3.5" />}
                className="lg:col-span-4"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">EC + Parliament</span>
                }
              >
                <ElectoralIntel />
              </Panel>

              {/* AI Brief */}
              <Panel
                title="AI Intelligence Brief"
                dataComponent="aiBrief"
                icon={<Brain className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    AI-Powered
                  </span>
                }
              >
                <AIBrief />
              </Panel>
            </div>
          )}

          {/* ═══ POLITICAL TAB ═══ */}
          {activeTab === "political" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Electoral Intelligence — wide */}
              <Panel
                title="Electoral Intelligence"
                dataComponent="electoralIntelligence"
                icon={<Vote className="h-3.5 w-3.5" />}
                className="lg:col-span-8"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">EC + Parliament</span>
                }
              >
                <ElectoralIntel />
              </Panel>

              {/* Opposition Tracker */}
              <Panel
                title="Opposition Tracker"
                dataComponent="oppositionTracker"
                icon={<Shield className="h-3.5 w-3.5" />}
                className="lg:col-span-4"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Social Intel</span>
                }
              >
                <OppositionTracker />
              </Panel>

              {/* Activity Charts — time-series graphs */}
              <Panel
                title="Activity Over Time"
                dataComponent="activityCharts"
                icon={<Activity className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Trends</span>
                }
              >
                <ActivityCharts />
              </Panel>

              {/* Political Headlines */}
              <Panel
                title="Political Headlines"
                dataComponent="politicalHeadlines"
                icon={<FileText className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">UK Politics</span>
                }
              >
                <Headlines />
              </Panel>

              {/* Parliamentary Activity */}
              <Panel
                title="Parliamentary Activity"
                dataComponent="parliamentaryActivity"
                icon={<Landmark className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Live</span>
                }
              >
                <ParliamentBills />
              </Panel>

              {/* Hansard */}
              <Panel
                title="Hansard"
                dataComponent="hansard"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Parliament.uk</span>
                }
              >
                <HansardFeed />
              </Panel>

              {/* Social Mentions */}
              <Panel
                title="Social Mentions"
                dataComponent="socialMentions"
                icon={<AtSign className="h-3.5 w-3.5" />}
                className="lg:col-span-6 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">X / Social</span>
                }
              >
                <MentionsFeed />
              </Panel>

              {/* Live News */}
              <Panel
                title="Live News"
                dataComponent="liveNews"
                icon={<Tv className="h-3.5 w-3.5" />}
                className="lg:col-span-6"
                headerAction={
                  <span className="text-[0.5rem] text-red-500 flex items-center gap-1 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse" />
                    Live
                  </span>
                }
              >
                <LiveFeeds />
              </Panel>

              {/* AI Brief */}
              <Panel
                title="AI Intelligence Brief"
                dataComponent="aiBrief"
                icon={<Brain className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-emerald-600 uppercase tracking-wider flex items-center gap-1">
                    <Brain className="h-3 w-3" />
                    AI-Powered
                  </span>
                }
              >
                <AIBrief />
              </Panel>

              {/* Ward Explorer — all ward data in one place.
                  NOTE: upstream removed this panel (commit 2c83475, 'vote
                  share data was estimated, not sourced') — kept locally,
                  delete if you agree with upstream's reasoning. */}
              <Panel
                title="Ward Explorer"
                dataComponent="wardExplorer"
                icon={<LayoutGrid className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">28 WARDS</span>
                }
              >
                <WardDataHub />
              </Panel>
            </div>
          )}

          {/* ═══ POLLING TAB ═══ */}
          {activeTab === "polling" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* National Polling — full width */}
              <Panel
                title="National Polling"
                dataComponent="nationalPolling"
                icon={<PieChart className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Wikipedia / BPC Pollsters</span>
                }
              >
                <PollingDashboard />
              </Panel>
            </div>
          )}

          {/* ═══ DEMOGRAPHICS TAB ═══ */}
          {activeTab === "demographics" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Demographics — wide panel with charts */}
              <Panel
                title="Demographics"
                dataComponent="demographics"
                icon={<BarChart3 className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Census 2021</span>
                }
              >
                <Demographics />
              </Panel>

              {/* Schools */}
              <Panel
                title="Schools"
                dataComponent="schools"
                icon={<GraduationCap className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">DfE / GIAS</span>
                }
              >
                <SchoolsPanel />
              </Panel>

              {/* Public Health */}
              <Panel
                title="Public Health"
                dataComponent="publicHealth"
                icon={<HeartPulse className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">PHE Fingertips</span>
                }
              >
                <HealthPanel />
              </Panel>

              {/* Employment */}
              <Panel
                title="Employment & Economy"
                dataComponent="employmentEconomy"
                icon={<Briefcase className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">NOMIS / ONS</span>
                }
              >
                <EmploymentPanel />
              </Panel>

              {/* House Prices */}
              <Panel
                title="House Prices"
                dataComponent="housePrices"
                icon={<Home className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">HM Land Registry</span>
                }
              >
                <HousePricesPanel />
              </Panel>

              {/* Universal Credit */}
              <Panel
                title="Universal Credit"
                dataComponent="universalCredit"
                icon={<CreditCard className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">DWP / Stat-Xplore</span>
                }
              >
                <UniversalCreditPanel />
              </Panel>

              {/* EPC Ratings */}
              <Panel
                title="EPC Ratings"
                dataComponent="epcRatings"
                icon={<Zap className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">MHCLG / EPC Register</span>
                }
              >
                <EPCPanel />
              </Panel>

              {/* Constituency Profile */}
              <Panel
                title="Constituency Profile"
                dataComponent="constituencyProfileLibrary"
                icon={<BookOpen className="h-3.5 w-3.5" />}
                className="lg:col-span-12"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Census · NOMIS · ONS</span>
                }
              >
                <CommonsLibraryPanel />
              </Panel>

              {/* E-Petitions */}
              <Panel
                title="E-Petitions"
                dataComponent="ePetitions"
                icon={<FileText className="h-3.5 w-3.5" />}
                className="lg:col-span-8 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Parliament</span>
                }
              >
                <PetitionsPanel />
              </Panel>

              {/* Care Quality */}
              <Panel
                title="Care Quality"
                dataComponent="careQuality"
                icon={<Stethoscope className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[33.333rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">CQC</span>
                }
              >
                <CQCPanel />
              </Panel>
            </div>
          )}

          {/* ═══ LOCAL ISSUES TAB ═══ */}
          {activeTab === "local" && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-2 lg:gap-3">
              {/* Community Issues */}
              <Panel
                title="Community Issues"
                dataComponent="communityIssues"
                icon={<AlertTriangle className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">FixMyStreet</span>
                }
              >
                <FixMyStreet />
              </Panel>

              {/* Local News */}
              <Panel
                title="Local News"
                dataComponent="localNews"
                icon={<Newspaper className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Auto-updating</span>
                }
              >
                <NewsFeed />
              </Panel>

              {/* Search Trends */}
              <Panel
                title="Search Trends"
                dataComponent="searchTrends"
                icon={<TrendingUp className="h-3.5 w-3.5" />}
                className="lg:col-span-4 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">Google Trends</span>
                }
              >
                <TrendsPanel />
              </Panel>

              {/* Political Headlines (local relevance) */}
              <Panel
                title="Political Headlines"
                dataComponent="politicalHeadlines"
                icon={<FileText className="h-3.5 w-3.5" />}
                className="lg:col-span-6 max-h-[27.778rem]"
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">UK Politics</span>
                }
              >
                <Headlines />
              </Panel>

              {/* Live News */}
              <Panel
                title="Live News"
                dataComponent="liveNews"
                icon={<Tv className="h-3.5 w-3.5" />}
                className="lg:col-span-6"
                headerAction={
                  <span className="text-[0.5rem] text-red-500 flex items-center gap-1 uppercase tracking-wider">
                    <span className="h-1.5 w-1.5 bg-red-500 rounded-full animate-pulse" />
                    Live
                  </span>
                }
              >
                <LiveFeeds />
              </Panel>

            </div>
          )}

          {activeTab === "material" && (
            <div className="grid grid-cols-1 gap-2 lg:gap-3">
              <Panel
                title="Campaign Material"
                dataComponent="campaignMaterial"
                icon={<Camera className="h-3.5 w-3.5" />}
                headerAction={
                  <span className="text-[0.5rem] text-zinc-600 uppercase tracking-wider">
                    Leaflets · posters · social posts seen locally
                  </span>
                }
              >
                <LeafletsPanel />
              </Panel>
            </div>
          )}
        </div>

        {/* Footer */}
        <footer data-component="dashboardFooter" className="mt-4 pb-3 text-center">
          <p className="text-[0.556rem] text-zinc-700 uppercase tracking-wider">
            Ground Game Intel &middot; Constituency Intelligence Platform
          </p>
        </footer>
      </main>
    </div>
  );
}
