import { useSyncExternalStore } from 'react'
import {
  Bar,
  BarChart,
  LabelList,
  Rectangle,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'
import type { ResultQuestion } from '../lib/results.ts'

const ROW_HEIGHT = 52

interface EndLabelProps {
  /** The bar this label belongs to. */
  viewBox?: { y?: number; height?: number }
  /** The whole chart area (not just the plot), including the right margin. */
  parentViewBox?: { x?: number; width?: number }
  value?: string | number
}

/**
 * The "count (percentage)" text beside each bar. Every label starts at the right
 * end of the track, so the numbers line up in one column, and a choice with no
 * answers ("0 (0%)") sits in the same place as a full one ("6 (100%)") instead
 * of at the left edge. The track ends where the chart's right margin begins,
 * so that margin is the room left for the text.
 */
function renderEndLabel(props: EndLabelProps, rightMargin: number) {
  const { viewBox, parentViewBox, value } = props
  const trackEnd =
    (parentViewBox?.x ?? 0) + (parentViewBox?.width ?? 0) - rightMargin
  const middle = (viewBox?.y ?? 0) + (viewBox?.height ?? 0) / 2
  return (
    <text
      x={trackEnd + 8}
      y={middle}
      dy="0.35em"
      fill="#0f172a"
      fontSize={14}
      fontWeight={600}
    >
      {value}
    </text>
  )
}

// On phone-width screens the choice names and the numbers get less room, so the
// bars themselves keep a usable length.
const NARROW_QUERY = '(max-width: 480px)'

function subscribeNarrow(onChange: () => void) {
  const query = window.matchMedia(NARROW_QUERY)
  query.addEventListener('change', onChange)
  return () => query.removeEventListener('change', onChange)
}

function useNarrowScreen(): boolean {
  return useSyncExternalStore(
    subscribeNarrow,
    () => window.matchMedia(NARROW_QUERY).matches,
    () => false,
  )
}

/** Breaks text into lines of at most `max` characters (long words are split). */
function wrapText(text: string, max: number, maxLines: number): string[] {
  const lines: string[] = []
  let current = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    let rest = word
    while (rest.length > max) {
      if (current) {
        lines.push(current)
        current = ''
      }
      lines.push(rest.slice(0, max))
      rest = rest.slice(max)
    }
    if (!current) current = rest
    else if (current.length + 1 + rest.length <= max) current += ` ${rest}`
    else {
      lines.push(current)
      current = rest
    }
  }
  if (current) lines.push(current)
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines)
    kept[maxLines - 1] = `${kept[maxLines - 1].slice(0, max - 1)}…`
    return kept
  }
  return lines
}

interface TickProps {
  x?: number
  y?: number
  payload?: { value: string }
  /** choice id -> text. Passed in because two choices may share the same text. */
  names?: Record<string, string>
  /** Characters per line before the choice name wraps. */
  wrapAt?: number
}

/** The choice name beside each bar, wrapped onto up to three lines. */
function ChoiceTick({
  x = 0,
  y = 0,
  payload,
  names = {},
  wrapAt = 18,
}: TickProps) {
  const text = names[payload?.value ?? ''] ?? ''
  const lines = wrapText(text, wrapAt, 3)
  return (
    <text x={x} y={y} textAnchor="end" fill="#0f172a" fontSize={14}>
      {lines.map((line, index) => (
        <tspan
          key={index}
          x={x - 8}
          dy={index === 0 ? `${0.35 - (lines.length - 1) * 0.55}em` : '1.1em'}
        >
          {line}
        </tspan>
      ))}
    </text>
  )
}

/**
 * One question as a horizontal bar chart. Each bar is followed by its count and
 * percentage as text ("45 (86.5%)"), so the numbers carry the meaning and the
 * chart never depends on colour alone. A hidden table repeats the same numbers
 * for screen readers.
 */
export default function ResultsChart({
  question,
}: {
  question: ResultQuestion
}) {
  const narrow = useNarrowScreen()
  // Room to the right of the tracks for the "count (percentage)" text.
  const marginRight = narrow ? 96 : 104
  const data = question.choices.map((choice) => ({
    id: choice.choice_id,
    count: choice.count,
    label: `${choice.count} (${Number(choice.percentage)}%)`,
  }))
  const names = Object.fromEntries(
    question.choices.map((choice) => [choice.choice_id, choice.choice_text]),
  )
  // A full track is 100% of this question's answers, so bar length equals the
  // percentage shown next to it.
  const trackMax = Math.max(1, question.response_count)

  return (
    <div>
      <div
        aria-hidden="true"
        style={{ height: question.choices.length * ROW_HEIGHT + 8 }}
      >
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            layout="vertical"
            data={data}
            margin={{ top: 4, right: marginRight, bottom: 4, left: 0 }}
            barCategoryGap={10}
          >
            <XAxis type="number" hide domain={[0, trackMax]} />
            <YAxis
              type="category"
              dataKey="id"
              width={narrow ? 96 : 140}
              interval={0}
              axisLine={false}
              tickLine={false}
              tick={<ChoiceTick names={names} wrapAt={narrow ? 12 : 18} />}
            />
            <Bar
              dataKey="count"
              // Recharts drops zero-width bars from its data unless the bar has a
              // custom shape, and with them the number label and the grey track.
              // <Rectangle /> is the normal bar (it draws nothing at width 0), so
              // nothing looks different, but a choice with 0 answers keeps its
              // "0 (0%)" label.
              shape={<Rectangle />}
              fill="#334155"
              radius={[0, 4, 4, 0]}
              background={{ fill: '#e2e8f0', radius: 4 }}
              isAnimationActive={false}
            >
              <LabelList
                dataKey="label"
                content={(props) =>
                  renderEndLabel(props as unknown as EndLabelProps, marginRight)
                }
              />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <table className="sr-only">
        <caption>Results for: {question.question_text}</caption>
        <thead>
          <tr>
            <th scope="col">Choice</th>
            <th scope="col">Answers</th>
            <th scope="col">Percentage</th>
          </tr>
        </thead>
        <tbody>
          {question.choices.map((choice) => (
            <tr key={choice.choice_id}>
              <th scope="row">{choice.choice_text}</th>
              <td>{choice.count}</td>
              <td>{Number(choice.percentage)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
