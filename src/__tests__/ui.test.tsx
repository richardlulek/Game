import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  AreaChart,
  Badge,
  Card,
  Chip,
  EmptyState,
  FlashCell,
  GoldRule,
  Metric,
  MetricGrid,
  PrimaryButton,
  SecondaryButton,
  SectionHeading,
  Sparkline,
  StepButton,
  signed,
  trendColor,
} from "../components/ui";

describe("ui-bibliotek", () => {
  it("renderar alla primitiver utan att krascha eller ge NaN", () => {
    const html = renderToStaticMarkup(
      <Card>
        <SectionHeading>Rubrik</SectionHeading>
        <GoldRule />
        <MetricGrid>
          <Metric label="Kurs" value="$100" />
          <Metric label="Δ" value="+2 %" color={trendColor(0.02)} sub="idag" />
        </MetricGrid>
        <Sparkline data={[1, 2, 3, 2, 4]} color="#000" />
        <AreaChart data={[1, 2, 3]} color="#000" />
        <FlashCell value={2} prev={1}>2</FlashCell>
        <Chip active>Filter</Chip>
        <Badge>NY</Badge>
        <PrimaryButton>Köp</PrimaryButton>
        <SecondaryButton disabled>Sälj</SecondaryButton>
        <StepButton>+</StepButton>
      </Card>,
    );
    expect(html).toContain("Rubrik");
    expect(html).toContain("<svg");
    expect(html).not.toContain("NaN");
  });

  it("Sparkline/AreaChart hanterar för lite data", () => {
    expect(renderToStaticMarkup(<Sparkline data={[]} color="#000" />)).not.toContain("NaN");
    expect(renderToStaticMarkup(<AreaChart data={[1]} color="#000" />)).toContain("Not enough history yet.");
  });

  it("EmptyState visar innehåll", () => {
    const html = renderToStaticMarkup(<EmptyState icon="📭">Inget här</EmptyState>);
    expect(html).toContain("Inget här");
  });

  it("hjälpformaterare", () => {
    expect(signed(0.032)).toBe("+3.2%");
    expect(signed(-0.014)).toBe("-1.4%");
    expect(trendColor(1)).not.toBe(trendColor(-1));
  });
});
