/* eslint-disable */
/* prettier-ignore */
// @ts-nocheck
// Generated by unplugin-vue-router. ‼️ DO NOT MODIFY THIS FILE ‼️
// It's recommended to commit this file.
// Make sure to add this file to your tsconfig.json file as an "includes" or "files" entry.

declare module 'vue-router/auto-routes' {
  import type {
    RouteRecordInfo,
    ParamValue,
    ParamValueOneOrMore,
    ParamValueZeroOrMore,
    ParamValueZeroOrOne,
  } from 'vue-router'

  /**
   * Route name map generated by unplugin-vue-router
   */
  export interface RouteNamedMap {
    '/': RouteRecordInfo<'/', '/', Record<never, never>, Record<never, never>>,
    '/app/': RouteRecordInfo<'/app/', '/app', Record<never, never>, Record<never, never>>,
    '/app/dashboard/index-old': RouteRecordInfo<'/app/dashboard/index-old', '/app/dashboard/index-old', Record<never, never>, Record<never, never>>,
    '/app/login': RouteRecordInfo<'/app/login', '/app/login', Record<never, never>, Record<never, never>>,
    '/app/register': RouteRecordInfo<'/app/register', '/app/register', Record<never, never>, Record<never, never>>,
    '/app/session/[id]': RouteRecordInfo<'/app/session/[id]', '/app/session/:id', { id: ParamValue<true> }, { id: ParamValue<false> }>,
    '/app/video-call/': RouteRecordInfo<'/app/video-call/', '/app/video-call', Record<never, never>, Record<never, never>>,
    '/app/video-call/[id]': RouteRecordInfo<'/app/video-call/[id]', '/app/video-call/:id', { id: ParamValue<true> }, { id: ParamValue<false> }>,
    '/pricing': RouteRecordInfo<'/pricing', '/pricing', Record<never, never>, Record<never, never>>,
  }
}
