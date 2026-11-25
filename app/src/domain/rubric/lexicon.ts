/* Lexicons for the offline grader, caps and the scripted interviewer. Patterns run on the RAW lower-cased text
   (so "%", "₹", ":" and "?" survive). Keep them conservative: a false positive inflates a score. */

const r = (s: string) => new RegExp(s, 'i')

export const LEX = {
  /** Sentence-initial or explicit structure words. "first" only counts as a signpost at a clause start. */
  signpost: [
    /(^|[.!?;:]\s+|\n\s*|,\s+)(first(ly)?|second(ly)?|third(ly)?|finally|lastly|next|to start|to begin|step (one|two|three|\d))\b/gi,
    /\bmy approach\b|\bi('| wi)ll (structure|break) (this|it)\b|\b(two|three|four) (things|parts|steps|areas|buckets|levels|stages|questions)\b|\bframework\b|\bbreak (it|this) (down|into)\b/gi,
  ],
  /** "Label: …" structure at the start of a sentence, e.g. "North star: …", "Inputs: …". */
  labelColon: /(^|[.!?]\s+|\n\s*)([A-Za-z][\w'\-]*(\s[\w'\-]+){0,2}):\s+\S/g,
  assumption: [/\bassum(e|ing|ption)/i, /\blet'?s say\b/i, /\bsuppose\b/i, /\bi'?ll take\b/i, /\bif we take\b/i],
  goal: [/\b(goal|objective|purpose|aim)\b/i, /\bis (meant|there) to\b/i, /\bthe point of\b/i, /\bwhat (success|the feature) (looks like|is for)\b/i, /\btrying to (help|solve|get)\b/i, /\bso that\b/i, /\bjob to be done\b/i],
  conclusion: [
    /\b(therefore|in summary|to summari[sz]e|to conclude|in short|overall|net,|bottom line|so my answer|my recommendation|i('d| would) recommend|i recommend)\b/i,
    /\bi('d| would) (ship|launch|go with|pick|choose|roll out|not ship|hold)\b/i,
    /(^|[.!?]\s+)so,?\s+(i|my|we|the answer)\b/i,
  ],
  userTerm: /\b(users?|customers?|segments?|personas?|people who|buyers?|riders?|drivers?|merchants?|sellers?|shops?|shopkeepers?|students?|shoppers?|payers?|friends?|learners?|travell?ers?|passengers?|patients?|parents?|farmers?|creators?|restaurants?|partners?|flatmates?|owners?|members?|subscribers?|investors?|viewers?|readers?|families|households?|commuters?|employees?|hosts?|guests?|teachers?|doctors?|vendors?|retailers?|kirana|sme|smbs?|consumers?|cohorts?|audience|beneficiar(y|ies)|delivery (agents?|partners?)|gig workers?)\b/gi,
  segmentQualifier: /\b(first[- ]time|repeat|new|power|heavy|light|casual|returning|loyal|churned|dormant|tier[- ]?[123]|metro|rural|urban|college|young|older|senior|small|large|premium|budget|price[- ]sensitive|working|busy|non[- ]tech|low[- ]income|high[- ]value|frequent|occasional)\s+\w+/gi,
  segmentChoice: [/\b(focus|focusing) on\b/i, /\btarget(ing)?\b/i, /\bprimary (user|segment|persona|customer)\b/i, /\b(start|starting) with\b/i, /\bi('d| would) (pick|choose|prioriti[sz]e|go after)\b/i, /\bthe (user|segment) (i|we)('d| would)?\s*(pick|choose|focus)/i, /\bbiggest pain\b/i],
  pain: [/\b(pain|struggle|frustrat|hassle|problem|friction|awkward|anxious|anxiety|confus|worr|afraid|forget|stuck|waste|wait|delay|time[- ]consuming|effort|chase|chasing|embarrass|hard to|difficult|can'?t|cannot|need(s)? to|save (them )?time|saves? time)\w*/i],
  insight: [/\binsight\b/i, /\bbehaviou?r\b/i, /\bvalidate\b/i, /\buser (interviews?|research)\b/i, /\btest (it|this) with\b/i, /\bnon[- ]obvious\b/i],
  solutionPhrase: /\b(i('d| would)|we('d| would| should)|let'?s) (build|add|create|make|launch|introduce|design)\b|\b(an? )?(app|feature|button|checklist|chatbot|dashboard) (that|which|to)\b/i,
  prioritisation: [/\bprioriti[sz]/i, /\bmost important\b/i, /\b(pick|choose|chose|chosen|picked)\b/i, /\bfocus on\b/i, /\btrade[- ]?offs?\b/i, /\binstead of\b/i, /\brather than\b/i, /\bdrop\b/i, /\bnot build\b/i, /\bdeprioriti[sz]/i, /\b(main|primary|key|one) (metric|number|goal|focus|thing|bet|lever|option|priority|hypothesis)\b/i, /\bnorth[- ]star\b/i, /\bonly (one|if)\b/i, /\bgo with\b/i, /\bover (the )?(other|rest)\b/i, /\b(first|start) with\b/i, /\bbiggest\b/i, /\b(top|first) (hypothesis|priority|option)\b/i],
  criterion: [/\bbecause\b/i, /\bsince\b/i, /\bcriteri(on|a)\b/i, /\b(impact|effort|reach|feasib|likelihood|cost|roi)\b/i, /\bcloses?t to\b/i, /\bmatters? most\b/i, /\bwhich is why\b/i, /\bthat'?s why\b/i, /\bgiven (that|our|the)\b/i, /\bbeats?\b/i, /\bhighest\b/i],
  tradeoff: [/\btrade[- ]?offs?\b/i, /\brisks?\b/i, /\bdownside\b/i, /\bat the (expense|cost) of\b/i, /\bcannibali[sz]/i, /\bcould (shrink|hurt|reduce|drop|fall|backfire|annoy)/i, /\bonly if\b/i, /\bif it (dips|drops|falls|hurts)\b/i, /\bthe catch\b/i, /\bwhat we (lose|give up)\b/i, /\bgive up\b/i, /\bwon'?t (do|build)\b/i, /\bi('d| would) (drop|not build|skip|park)\b/i, /\bprotect\b/i, /\bside[- ]effects?\b/i, /\bunintended\b/i],
  recommendation: [/\bi('d| would)? ?recommend\b/i, /\bmy recommendation\b/i, /\bi('d| would) (ship|launch|go with|pick|choose|roll out|enter|invest|build|not ship|hold|start)\b/i, /\bwe should (ship|launch|go|enter|build|start|not)\b/i, /\bmy (pick|call|bet)\b/i, /\bthe answer is\b/i, /\bdecision\b/i],
  feasibility: [/\bfeasib/i, /\b(cost|budget|team|capabilit|timeline|regulat|licen[cs]e|capital|unit economics|margin|resources?|engineering effort|operations?|supply)\w*/i],
  hypothesisOrder: [/\b(most likely|likeliest|first check|check first|start by checking|in order of|order(ed)? by|easiest to check|then check|next i('d| would) check)\b/i, /\bhypothes[ie]s\b/i],
  dataCheck: [/\b(data|tracking|instrumentation|logging|dashboard|pipeline)\b.*\b(bug|issue|broken|correct|real|right|change|glitch)\b/i, /\b(is the (drop|data|number|metric) real|check (the )?(data|tracking|instrumentation))\b/i, /\bdefinition (changed|change)\b/i, /\breporting (bug|issue|error)\b/i],
  metricTerm: [/\bmetrics?\b/i, /\bmeasur/i, /\brates?\b/i, /%/, /\bper\b/i, /\bretention\b/i, /\bconversion\b/i, /\b[dwm]au\b/i, /\bnps\b/i, /\brevenue\b/i, /\baov\b/i, /\bnorth[- ]star\b/i, /\bguardrail\b/i, /\bkpis?\b/i, /\bshare of\b/i, /\bnumber of\b/i, /\btime to\b/i, /\bchurn\b/i, /\bfrequency\b/i, /\bgmv\b/i, /\bctr\b/i, /\bcount\b/i],
  namedMetric: [/\b(share|percentage|proportion|fraction|number|count|%) of [\w\s'\-]{3,40}/i, /\b[\w'\-]+(\s[\w'\-]+){0,3} (rate|ratio)\b/i, /\b[\w'\-]+(\s[\w'\-]+){0,3} per (active |repeat |new |paying )?(user|shopper|customer|buyer|rider|driver|merchant|student|session|order|day|week|month|learner|member)s?\b/i, /\bnorth[- ]star( metric)?( is|:)\s+\S/i, /\b(main|primary|key|core) metric (is|would be|:)\s+\S/i, /\b[dwm]au\b/i, /\bretention\b/i, /\bconversion\b/i, /\baov\b/i, /\bgmv\b/i],
  guardrail: [/\bguardrails?\b/i, /\bcounter[- ]?metrics?\b/i, /\bcountermetrics?\b/i, /\bwatch (whether|for|that|out)\b/i, /\bmake sure\b.*\b(doesn'?t|does not|isn'?t|not)\b/i, /\b(doesn'?t|does not|without) (drop|fall|hurt|harm|reduc|cannibali[sz])/i, /\bcannibali[sz]/i, /\b(harm|side[- ]effects?|unintended)\b/i, /\bat the expense of\b/i, /\bunpaid\b/i, /\bopt[- ]?outs?\b/i, /\buninstall/i, /\bcomplaints?\b/i, /\bspam\b/i, /\bcould (shrink|hurt|reduce|drop)\b/i, /\bnot (hurting|harming)\b/i],
  timeWindow: [/\b(per|a|each|every) (day|week|month|quarter|session)\b/i, /\bwithin (a|one|two|three|\d+|seven|thirty|the first) ?(hours?|days?|weeks?|months?)?\b/i, /\b(daily|weekly|monthly|quarterly)\b/i, /\b(over|in|after|for) (the (first|next) )?(one|two|three|four|six|\d+) (days?|weeks?|months?|quarters?)\b/i, /\b\d+[- ]day\b/i, /\bd(1|7|30)\b/i, /\bfirst (week|month|quarter|7 days|30 days)\b/i],
  target: [/\btargets?\b/i, /\bbaseline\b/i, /\bthreshold\b/i, /\bbenchmark\b/i, /\b(increase|grow|lift|improve|reduce|cut) (it |this |by )?(by )?\d+(\.\d+)?\s?%/i, /\b\d+(\.\d+)?\s?% (lift|increase|uplift|improvement|drop)\b/i, /\bgoal of \d/i],
  leadingLagging: [/\bleading\b/i, /\blagging\b/i, /\ba\/?b test\b/i, /\bexperiment\b/i, /\bcontrol group\b/i, /\bholdout\b/i, /\bstatistical(ly)? significan/i],
  vanity: [/\bnps (for|of) the app\b/i, /\bapp[- ]?(store )?ratings?\b/i, /\bdownloads\b/i, /\binstalls\b/i, /\bpage ?views\b/i, /\blikes\b/i, /\bimpressions\b/i, /\bapp[- ]level nps\b/i, /\bsocial media\b/i, /\bbuzz\b/i],
  sanity: [/\bsanity\b/i, /\bcross[- ]?check/i, /\btriangulat/i, /\brange\b/i, /\broughly\b/i, /\bballpark\b/i, /\bmakes sense\b/i, /\bseems (reasonable|high|low|right)\b/i, /\bcompare (it )?(with|to|against)\b/i, /\bcheck (it|this|that) (against|with)\b/i, /\bin the order of\b/i, /\bbetween \d[\d,.]*\s*(and|to|-)\s*\d/i],
  arithmetic: [/[×x*÷=]\s*\d|\d\s*[×x*÷=]/i, /\btimes\b/i, /\bmultipl/i, /\bdivid/i, /\bcomes (to|out to)\b/i, /\bgives (us|me|about|around)?\b/i, /\bthat'?s (about|around|roughly)? ?\d/i, /\btotal(s|ling)?\b/i],
  sensitivity: [/\bmost sensitive\b/i, /\bbiggest (driver|swing|assumption|uncertainty)\b/i, /\bif (this|that|it) (is|were) (off|wrong|double|half)\b/i, /\bsensitiv/i, /\btwo (approaches|ways|methods)\b/i, /\bbottom[- ]up\b.*\btop[- ]down\b|\btop[- ]down\b.*\bbottom[- ]up\b/i],
  fillers: /\b(um+|uh+|erm|basically|actually|you know|sort of|kind of|i mean|literally|like,)\b/gi,
  hedges: /\b(maybe|perhaps|i think|i guess|probably|possibly|might|not sure|i feel like)\b/gi,
  jargonAcronym: /\b[A-Z]{2,6}s?\b/g,
  claim: [/\bi would\b|\bi'?d\b/i, /\bwe should\b/i, /\bfirst\b/i, /\bbecause\b/i, /\b(main|primary|north[- ]star|key)\b/i, /\bi('d| would)? ?recommend\b/i, /\bmy (pick|approach|answer)\b/i],
  idk: /\b(i (really )?(don'?t|do not) know|no idea|not sure|no clue|idk|i'?m blank|can'?t think|pass|skip( this)?|i have no (idea|clue))\b/i,
  hint: /\b(hint|clue|nudge me|point me|where (should|do) i (start|begin)|help me (out|start|get started)|any pointers|can you help( me)?|give me a (direction|pointer)|i need help)\b/i,
  answerRequest: /\b(what('?s| is) the (right |correct |ideal |best |model )?answer|tell me the answer|just tell me|what would you (do|say|answer)|give me the answer|model answer|what should i (say|answer)|show me (a|the) (good|right|sample) answer|what'?s the solution)\b/i,
  scoreRequest: /\b(what('?s| is| would be) my score|what score|(score|rating|grade) (would|do|will) you give|give me a (score|rating|grade)|my score so far|how am i doing|how did i do|how('?s| is) my answer|rate (me|my answer)|grade me|score me|out of (5|five|10|ten)|am i doing (well|ok|okay|good)|is (this|that) (good|right|correct)( so far)?)\b/i,
  injection: /\b(ignore (all |any |your |the )?(previous |prior |above |earlier )?(instructions|rules|prompt)|system prompt|you are now|act as|developer mode|jailbreak|give me (a )?(5|five)(\/5| out of)|score (this|me) (a )?(5|five)|5\/5|disregard (your|the|all)|new instructions|pretend (you|to be))\b/i,
}

export { r }
