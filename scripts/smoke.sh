#!/usr/bin/env bash
# End-to-end API check against a running server. Usage: scripts/smoke.sh [base_url]
set -u
B=${1:-http://localhost:3000}
J=$(mktemp); C=$(mktemp)
H=(-s -b "$C" -c "$C" -H "x-kalakar: 1")
pass=0; fail=0
ok(){ if [ "$1" = "1" ]; then pass=$((pass+1)); else fail=$((fail+1)); echo "FAIL: $2"; fi; }
jq_(){ node -e "let d=\"\";process.stdin.on(\"data\",c=>d+=c).on(\"end\",()=>{try{const j=JSON.parse(d);console.log(eval(process.argv[1]))}catch(e){console.log(\"ERR\",d.slice(0,200))}})" "$1"; }
EMAIL="smoke$(date +%s)@example.com"
R=$(curl "${H[@]}" -H "content-type: application/json" -d "{\"name\":\"Asha\",\"email\":\"$EMAIL\",\"password\":\"password123\",\"kind\":\"business\"}" $B/api/auth/signup)
ok $([ "$(echo $R | jq_ "j.user.credits")" -gt 0 ] && echo 1) "signup"
R=$(curl "${H[@]}" -X PUT -H "content-type: application/json" -d "{\"displayName\":\"Itr House\",\"category\":\"Perfume / attar\",\"description\":\"Hand-blended attars from Lucknow.\",\"audience\":\"Women 22-40 who love traditional fragrances\",\"tone\":\"warm and poetic\",\"language\":\"en\",\"colors\":[\"#1B1A17\",\"#F1EBE1\",\"#B8865B\"],\"fontStyle\":\"serif\",\"cta\":\"DM to order\",\"website\":\"itrhouse.in\",\"onboarded\":true}" $B/api/profile)
ok $([ "$(echo $R | jq_ "j.user.onboarded")" = "true" ] && echo 1) "profile"
node -e "require(\"sharp\")(Buffer.from(\`<svg xmlns=\\\"http://www.w3.org/2000/svg\\\" width=\\\"900\\\" height=\\\"900\\\"><rect width=\\\"900\\\" height=\\\"900\\\" fill=\\\"#e5d3bd\\\"/><rect x=\\\"360\\\" y=\\\"260\\\" width=\\\"180\\\" height=\\\"460\\\" rx=\\\"40\\\" fill=\\\"#8a5530\\\"/><rect x=\\\"405\\\" y=\\\"170\\\" width=\\\"90\\\" height=\\\"110\\\" fill=\\\"#222\\\"/></svg>\`)).jpeg().toFile(\"data/sample.jpg\")"
R=$(curl "${H[@]}" -F "file=@data/sample.jpg" $B/api/assets); IMG=$(echo $R | jq_ "j.asset.id")
ok $([ ${#IMG} -gt 10 ] && echo 1) "upload"
R=$(curl "${H[@]}" -H "content-type: application/json" -d "{\"name\":\"Monsoon Oudh\",\"price\":\"₹1,499\",\"offer\":\"Free delivery this week\",\"description\":\"Oudh with rose and vetiver. Lasts 12 hours. Aged 30 days.\",\"features\":[\"Alcohol-free attar\",\"Aged for 30 days\",\"Lasts 12 hours\"],\"images\":[\"$IMG\"]}" $B/api/products); PID=$(echo $R | jq_ "j.product.id")
ok $([ ${#PID} -gt 10 ] && echo 1) "product"
mk(){ curl "${H[@]}" -H "content-type: application/json" -d "{\"brief\":{\"format\":\"$1\",\"productId\":\"$PID\",\"goal\":\"$2\",\"style\":\"$3\",\"language\":\"en\",\"voice\":{\"enabled\":true,\"gender\":\"female\",\"style\":\"warm\"},\"aiScene\":false,\"music\":false}}" $B/api/posts | jq_ "j.post?.id ?? j.error"; }
P1=$(mk image showcase auto); P2=$(mk carousel educate bold); P3=$(mk reel launch playful); P4=$(mk story offer luxury)
for i in $(seq 1 90); do
  S=$(curl "${H[@]}" "$B/api/posts" | jq_ "j.posts.map(p=>p.status).join(\",\")")
  case "$S" in *generating*|*draft*) sleep 2;; *) break;; esac
done
echo "statuses: $S"
ok $([ "$(echo $S | grep -o ready | wc -l)" = "4" ] && echo 1) "4 posts generated"
curl "${H[@]}" "$B/api/posts/$P3" | jq_ "\"reel: \"+j.post.media.map(m=>m.mime+\" \"+m.duration+\"s\").join()+\" | slides \"+j.post.content.slides.length+\" | notes: \"+j.post.content.notes.join(\" / \")"
curl "${H[@]}" "$B/api/posts/$P2" | jq_ "\"carousel: \"+j.post.media.length+\" images, caption \"+j.post.content.caption.length+\" chars, tags \"+j.post.content.hashtags.length"
M=$(curl "${H[@]}" "$B/api/posts/$P1" | jq_ "j.post.media[0].url"); CODE=$(curl -s -o /dev/null -w "%{http_code}" $B$M); ok $([ "$CODE" = "200" ] && echo 1) "media served publicly"
R=$(curl "${H[@]}" -X POST "$B/api/posts/$P1/publish"); ok $(echo $R | grep -q "Connect your Instagram" && echo 1) "publish blocked without IG"
R=$(curl "${H[@]}" -H "content-type: application/json" -d "{\"username\":\"itr.house\"}" $B/api/instagram/demo); ok $(echo $R | grep -q itr.house && echo 1) "demo IG connect"
curl "${H[@]}" -X POST "$B/api/posts/$P1/publish" >/dev/null
AT=$(node -e "console.log(new Date(Date.now()+86400000).toISOString())")
R=$(curl "${H[@]}" -H "content-type: application/json" -d "{\"at\":\"$AT\"}" "$B/api/posts/$P2/schedule"); ok $([ "$(echo $R | jq_ "j.post.status")" = "scheduled" ] && echo 1) "schedule"
R=$(curl "${H[@]}" -H "content-type: application/json" -d "{\"slides\":[{\"kicker\":\"\",\"headline\":\"Edited headline\",\"body\":\"\",\"voiceover\":\"\"}],\"caption\":\"New caption\"}" -X PATCH "$B/api/posts/$P4"); ok $([ "$(echo $R | jq_ "j.post.content.slides[0].headline")" = "Edited headline" ] && echo 1) "edit text"
curl "${H[@]}" -X POST "$B/api/posts/$P4/render" >/dev/null
sleep 6
S1=$(curl "${H[@]}" "$B/api/posts/$P1" | jq_ "j.post.status"); ok $([ "$S1" = "published" ] && echo 1) "published (demo) got $S1"
S4=$(curl "${H[@]}" "$B/api/posts/$P4" | jq_ "j.post.status"); ok $([ "$S4" = "ready" ] && echo 1) "re-render got $S4"
R=$(curl "${H[@]}" -X PUT -H "content-type: application/json" -d "{\"enabled\":true,\"days\":[1,2,3,4,5,6,7],\"time\":\"19:00\",\"formats\":[\"image\",\"carousel\"],\"productIds\":[],\"goals\":[\"showcase\",\"offer\"],\"requireApproval\":true}" $B/api/autopilot)
ok $([ "$(echo $R | jq_ "j.result.created")" -ge 6 ] && echo 1) "autopilot created $(echo $R | jq_ "j.result.created") posts"
R=$(curl "${H[@]}" $B/api/me); echo "credits left: $(echo $R | jq_ "j.user.credits")"
R=$(curl "${H[@]}" $B/api/dashboard); echo "dashboard: $(echo $R | jq_ "JSON.stringify(j.counts)")"
CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST -H "content-type: application/json" -d "{}" -b "$C" $B/api/profile/logo); ok $([ "$CODE" = "403" ] && echo 1) "csrf guard"
echo "PASS $pass FAIL $fail"
