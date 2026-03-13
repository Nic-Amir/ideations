import { getGameBySlug } from "@/lib/games/game-registry";

export function getPageContext(pathname: string) {
  if (pathname === "/") {
    return {
      title: "Market Gaming Terminal",
      subtitle:
        "Explore market-sourced game modules with clearer risk, pace, and payout context.",
      game: null,
      usesStream: false,
    };
  }

  if (pathname === "/provably-fair") {
    return {
      title: "Provably Fair Framework",
      subtitle:
        "Review the entropy sources, payout math, and assumptions behind each module.",
      game: null,
      usesStream: false,
    };
  }

  if (pathname.startsWith("/game/")) {
    const slug = pathname.replace("/game/", "");
    const game = getGameBySlug(slug);

    if (game) {
      return {
        title: game.name,
        subtitle: game.shortPitch,
        game,
        usesStream: game.marketSource === "Deriv live ticks",
      };
    }
  }

  return {
    title: "Ideations",
    subtitle: "Market-driven play surfaces.",
    game: null,
    usesStream: false,
  };
}
