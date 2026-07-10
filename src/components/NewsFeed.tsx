"use client";

import { useConstituencyResource } from "@/hooks/useConstituencyResource";
import FeedItem from "./ui/FeedItem";
import PanelSkeleton from "./ui/PanelSkeleton";

interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
  snippet: string;
}

interface NewsResponse {
  items?: NewsItem[];
}

export default function NewsFeed() {
  const fallback: NewsResponse = { items: getMockNews() };
  const { data, loading, error } = useConstituencyResource<NewsResponse>(
    "/api/news",
    { fallback, errorMessage: "Unable to load news feed" }
  );

  if (loading) return <PanelSkeleton variant="list" rows={5} />;

  const items = data?.items ?? [];

  return (
    <div data-component="newsFeedContainer">
      {error && (
        <div className="px-4 py-2 bg-yellow-500/10 border-b border-yellow-500/20 text-xs text-yellow-400">
          {error} — showing sample data
        </div>
      )}
      <div className="divide-y divide-border/50">
        {items.map((item, i) => (
          <FeedItem
            key={i}
            href={item.link}
            title={item.title}
            snippet={item.snippet}
            meta={
              <>
                <span className="text-emerald-500/70 font-medium">{item.source}</span>
                <span>&middot;</span>
              </>
            }
            date={item.pubDate}
          />
        ))}
      </div>
    </div>
  );
}

function getMockNews(): NewsItem[] {
  return [
    {
      title: "Braintree District Council approves new housing development near Panfield",
      link: "#",
      pubDate: new Date(Date.now() - 2 * 3600000).toISOString(),
      source: "Braintree & Witham Times",
      snippet: "Plans for 250 new homes on the edge of Braintree have been approved by the planning committee despite local opposition.",
    },
    {
      title: "Essex Police report drop in anti-social behaviour across Braintree district",
      link: "#",
      pubDate: new Date(Date.now() - 5 * 3600000).toISOString(),
      source: "Essex Live",
      snippet: "Anti-social behaviour incidents have fallen by 12% compared to the same period last year.",
    },
    {
      title: "A120 roadworks cause delays for Braintree commuters",
      link: "#",
      pubDate: new Date(Date.now() - 8 * 3600000).toISOString(),
      source: "BBC Essex",
      snippet: "National Highways warns of significant delays as resurfacing work continues on the A120 between Braintree and Marks Tey.",
    },
    {
      title: "Local MP James Cleverly visits new apprenticeship scheme in Witham",
      link: "#",
      pubDate: new Date(Date.now() - 12 * 3600000).toISOString(),
      source: "Braintree & Witham Times",
      snippet: "The Braintree MP praised the initiative which aims to create 50 new apprenticeship places for young people.",
    },
    {
      title: "Halstead care home rated 'outstanding' by CQC inspectors",
      link: "#",
      pubDate: new Date(Date.now() - 18 * 3600000).toISOString(),
      source: "Halstead Gazette",
      snippet: "The care home received top marks in all five inspection categories.",
    },
    {
      title: "Essex County Council announces school funding boost for rural areas",
      link: "#",
      pubDate: new Date(Date.now() - 24 * 3600000).toISOString(),
      source: "Essex Chronicle",
      snippet: "Schools in the Braintree district will receive an additional £1.2m in funding for the next academic year.",
    },
    {
      title: "Coggeshall heritage festival draws record crowds",
      link: "#",
      pubDate: new Date(Date.now() - 30 * 3600000).toISOString(),
      source: "East Anglian Daily Times",
      snippet: "Over 5,000 visitors attended the annual celebration of the town's medieval wool trade history.",
    },
    {
      title: "Plans unveiled for new GP surgery to serve growing Braintree population",
      link: "#",
      pubDate: new Date(Date.now() - 36 * 3600000).toISOString(),
      source: "Essex Live",
      snippet: "The new facility aims to address growing patient numbers following recent housing developments in the area.",
    },
  ];
}
