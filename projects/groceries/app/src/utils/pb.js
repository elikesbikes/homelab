import PocketBase from 'pocketbase'

export const pbUrl = window.location.origin
export const pb = new PocketBase(pbUrl)
