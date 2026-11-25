import { describe, expect, it } from 'vitest'
import { CURATED_QUESTIONS, validateQuestions } from './index'
import { TOPICS } from '@/domain/types'

const SUBTYPES: Record<string, string[]> = {
  product_design: ['design_new', 'improve_existing', 'design_for_segment', 'favourite_product'],
  rca: ['metric_drop', 'metric_spike_or_anomaly', 'funnel_or_adoption', 'ops_quality'],
  metrics: ['define_success', 'north_star', 'ab_test_readout', 'metric_tradeoff'],
  guesstimate: ['market_size', 'count_estimate', 'revenue_estimate', 'capacity_ops'],
  strategy: ['market_entry', 'competitive_response', 'monetisation_pricing', 'build_buy_partner'],
  tech: ['explain_concept', 'how_it_works', 'ai_ml_product', 'tech_tradeoff'],
}

describe('curated questions', () => {
  it('validates with no problems', () => {
    expect(validateQuestions(CURATED_QUESTIONS)).toEqual([])
  })
  it('has 96 questions, 16 per topic, 4 per sub-type, 5/7/4 difficulty', () => {
    expect(CURATED_QUESTIONS.length).toBe(96)
    for (const t of TOPICS) {
      const qs = CURATED_QUESTIONS.filter(q => q.topic === t)
      expect(qs.length).toBe(16)
      for (const st of SUBTYPES[t]) expect(qs.filter(q => q.subtype === st).length).toBe(4)
      expect(qs.filter(q => q.difficulty === 'easy').length).toBe(5)
      expect(qs.filter(q => q.difficulty === 'medium').length).toBe(7)
      expect(qs.filter(q => q.difficulty === 'hard').length).toBe(4)
    }
  })
  it('has the demo questions', () => {
    expect(CURATED_QUESTIONS.find(q => q.id === 'met-101')?.prompt).toContain('Split the bill')
    expect(CURATED_QUESTIONS.find(q => q.id === 'met-102')?.prompt).toContain('Reorder')
  })
  it('detects problems', () => {
    const bad = { ...CURATED_QUESTIONS[0], followUpSeeds: [] }
    expect(validateQuestions([bad, bad]).length).toBeGreaterThan(0)
  })
})
