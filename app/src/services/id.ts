import { ulid } from 'ulid'
import { Clock } from './clock'
export const newId = () => ulid(Clock.now())
