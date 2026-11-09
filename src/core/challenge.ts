export interface Challenge {
  readonly id: string
  readonly title: string
  readonly expected: readonly number[]
}

export function verifyChallenge(output: readonly number[], challenge: Challenge): boolean {
  if (output.length !== challenge.expected.length) return false
  return output.every((value, index) => value === challenge.expected[index])
}
