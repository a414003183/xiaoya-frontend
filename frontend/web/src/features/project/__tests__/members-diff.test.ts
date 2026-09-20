import type { TeamMemberView } from '@zentao/api-client/generated/model/teamMemberView'
import { describe, expect, test } from 'vitest'
import { type MemberRow, membersDiff } from '../model'

/** 成员表 diff + 全量提交体（project §3.7/§5：POST members 恒为整表，后端 diff 落库，重复提交幂等）。 */

function member(account: string, overrides: Partial<TeamMemberView> = {}): TeamMemberView {
  return {
    id: account === 'admin' ? 1 : 2,
    objectType: 'project',
    objectId: 3,
    account,
    role: '开发',
    joinDate: '2026-01-01',
    days: 20,
    hours: 8,
    sort: 0,
    ...overrides,
  }
}

function row(account: string, overrides: Partial<MemberRow> = {}): MemberRow {
  return { account, role: '开发', joinDate: '2026-01-01', days: 20, hours: 8, sort: 0, ...overrides }
}

describe('membersDiff', () => {
  test('未改动时三列差量皆空，提交体与当前表一致', () => {
    const originals = [member('admin'), member('dev1', { sort: 1 })]
    const diff = membersDiff(originals, [row('admin'), row('dev1', { sort: 1 })])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
    expect(diff.updated).toEqual([])
    expect(diff.members.map((item) => item.account)).toEqual(['admin', 'dev1'])
  })

  test('增：新账号进 added 且出现在提交体；删：原表账号不在草稿则进 removed', () => {
    const originals = [member('admin'), member('dev1', { sort: 1 })]
    const diff = membersDiff(originals, [row('guest'), row('admin')])
    expect(diff.added).toEqual(['guest'])
    expect(diff.removed).toEqual(['dev1'])
    expect(diff.updated).toEqual([])
    expect(diff.members.map((item) => item.account)).toEqual(['admin', 'guest'])
  })

  test('改：role/days/hours/joinDate/sort 任一变化即进 updated', () => {
    const originals = [member('admin'), member('dev1', { sort: 1 })]
    const diff = membersDiff(originals, [row('admin', { role: null }), row('dev1', { sort: 1, days: 10, hours: 6 })])
    expect(diff.updated.sort()).toEqual(['admin', 'dev1'])
    expect(diff.added).toEqual([])
    expect(diff.removed).toEqual([])
  })

  test('幂等：同输入重复计算得到同一提交体（与草稿顺序无关）', () => {
    const originals = [member('admin'), member('dev1', { sort: 1 })]
    const drafts = [row('dev1', { sort: 1, hours: 6 }), row('admin'), row('guest', { sort: 2 })]
    const first = membersDiff(originals, drafts)
    const second = membersDiff(originals, [...drafts].reverse())
    expect(first).toEqual(second)
    // 提交体即整表：把提交体当作原表再 diff 一次，差量为空（重复提交不产生变更）
    const originalsAfter = first.members.map((item, index) =>
      member(item.account, {
        id: index + 1,
        role: item.role ?? null,
        joinDate: item.joinDate ?? '',
        days: item.days ?? 0,
        hours: item.hours ?? 0,
        sort: item.sort ?? 0,
      }),
    )
    const replayDrafts = first.members.map((item) =>
      row(item.account, {
        role: item.role ?? null,
        joinDate: item.joinDate ?? '',
        days: item.days ?? 0,
        hours: item.hours ?? 0,
        sort: item.sort ?? 0,
      }),
    )
    const replay = membersDiff(originalsAfter, replayDrafts)
    expect(replay.added).toEqual([])
    expect(replay.removed).toEqual([])
    expect(replay.updated).toEqual([])
    expect(replay.members).toEqual(first.members)
  })

  test('删空整表：全部原账号进 removed，提交体为空数组', () => {
    const diff = membersDiff([member('admin'), member('dev1', { sort: 1 })], [])
    expect(diff.removed.sort()).toEqual(['admin', 'dev1'])
    expect(diff.members).toEqual([])
  })
})
