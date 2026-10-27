"""Builds swiss_posts_raw.csv from the Crustdata social_post_search pulls made for the Swiss deep-dive.
Text is truncated to 280 chars. true_date_utc is decoded from the LinkedIn activity/ugcPost id
(id >> 22 = ms since epoch), because the index's date_posted is imputed for many posts."""
import csv, datetime, re, sys

OUT = sys.argv[1]
SRC = "Crustdata /social_post/search (index through ~2026-09-17)"
# (author, channel, index_date_posted, post_type_index, format, reactions, comments, shares, url, text)
R = [
# --- DECALIA company page: top 5 by reactions, 17 Jun - 17 Sep 2026 ---
("DECALIA (company page)","company","2026-08-15","original","image",63,0,0,"https://www.linkedin.com/posts/decalia-asset-management-sa_decalia-teamspirit-cycling-activity-7493591569711755264-pQqi","Despite the extreme summer heat, a few members of the DECALIA cycling crew took on the Salève and made the most of the season together."),
("DECALIA (company page)","company","2026-08-22","original","image",52,0,3,"https://www.linkedin.com/posts/decalia-asset-management-sa_hier-c%C3%A9tait-aussi-la-rentr%C3%A9e-chez-decalia-activity-7496496524152066048-FTcL","Hier, c'était aussi la rentrée chez DECALIA ! ... notre conférence annuelle « Market Outlook ». Un grand merci à nos trois intervenants..."),
("DECALIA (company page)","company","2026-09-08","original","image",34,0,3,"https://www.linkedin.com/posts/decalia-asset-management-sa_decalia-gestionprivaeze-wealthmanagement-activity-7502998314066542592-7a9I","Comment se différencier et faire évoluer son modèle dans une gestion de fortune en pleine transformation ? Merci à SPHERE pour les EAM Days..."),
("DECALIA (company page)","company","2026-08-29","original","image",32,0,2,"https://www.linkedin.com/posts/decalia-asset-management-sa_decalia-gestionprivaeze-wealthmanagement-activity-7498661844719411201-k2rc","Dans un secteur où l'information est partout, la véritable différence se joue dans l'expertise. Sebastien Demole... panel « Se spécialiser pour se différencier »"),
("DECALIA (company page)","company","2026-08-16","repost_without_thoughts","article",28,0,2,"https://www.linkedin.com/posts/decalia-asset-management-sa_reji-vettasseri-not-everyone-in-private-activity-7485262484711407616-OaD9","In an interview with Finews AG, Reji Vettasseri, Lead Portfolio Manager at DECALIA, discusses why selectivity, expertise and disciplined execution are essential... private credit."),
# --- Pictet Asset Management company page: top 5 by reactions, same window ---
("Pictet Asset Management (company page)","company","2026-09-02","original","image",147,0,4,"https://www.linkedin.com/posts/pictet-asset-management_today-the-pictet-group-announced-the-figures-activity-7499022732894855168-PQMN","Today, the Pictet Group announced the figures for the first half of 2026... assets clients entrusted to Pictet reached an all-time high."),
("Pictet Asset Management (company page)","company","2026-07-14","repost_without_thoughts","image",141,1,20,"https://www.linkedin.com/posts/pictet-asset-management_we-are-launching-our-first-european-range-activity-7477986927124860928-vZy_","We are launching our first European range of AI-enhanced active equity ETFs... Pictet's proprietary AI model drives the entire stock process... Capital Risk Warning."),
("Pictet Asset Management (company page)","company","2026-08-10","original","image",119,2,3,"https://www.linkedin.com/posts/pictet-asset-management_many-of-the-companies-driving-the-environmental-activity-7483751092930052096-Cw5h","Many of the companies driving the environmental transition are still private... final close of its first dedicated environment co-investment fund, USD 253 million."),
("Pictet Asset Management (company page)","company","2026-06-18","repost_without_thoughts","image",116,5,1,"https://www.linkedin.com/posts/pictet-asset-management_la-semana-pasada-asistimos-a-la-ii-edici%C3%B3n-activity-7467510507353337857-k4Bn","La semana pasada asistimos a la II edición de los Premios Estrategias de Inversión... premio al Mejor Fondo de Renta Fija EE.UU."),
("Pictet Asset Management (company page)","company","2026-08-10","original","image",114,8,2,"https://www.linkedin.com/posts/pictet-asset-management_inversiaejn-lacocinafinanciera-activity-7485266162814144513-hJFT","Nuevos ingredientes y nuevas recetas... La Cocina Financiera para seguir explicando el mundo de la inversión de una forma tan clara como apetecible."),
# --- AtonRâ company page: 5 most recent indexed posts (none in window) ---
("AtonRâ Partners (company page)","company","2026-05-07","original","image",7,0,2,"https://www.linkedin.com/posts/atonra_thematicinvesting-atonra-chinatech-activity-7455499972474753025-B7ws","Tencent and Alibaba are in talks to take a stake in DeepSeek AI at a $40bn valuation... Our ChinaTech strategy... up 10.3% YTD and 60% since launch in February 2025."),
("AtonRâ Partners (company page)","company","2026-04-07","original","image",4,0,1,"https://www.linkedin.com/posts/atonra_thematicinvesting-atonraes-gridinfrastructure-activity-7437444987371450368-CiP1","The transformer backlog is not a demand spike. It's a structural lock-in. GE Vernova's grid division just reported Q4 orders of $7.4bn..."),
("AtonRâ Partners (company page)","company","2026-04-07","original","image",10,0,0,"https://www.linkedin.com/posts/atonra_thematicinvesting-atonra-chinatech-activity-7444624629765214209-6YMx","The instinct when the Middle East escalates: sell risk, sell China. We think that's backwards. Qatar's helium facility offline..."),
("AtonRâ Partners (company page)","company","2026-04-07","original","image",6,0,1,"https://www.linkedin.com/posts/atonra_thematicinvesting-atonra-chinatech-activity-7439566265846919169-SjsL","Everyone is watching the Middle East. Nobody is watching Beijing. China's National People's Congress ratified the largest technology spending mandate in history. $2 trillion..."),
("AtonRâ Partners (company page)","company","2026-02-06","repost_quote","text",0,0,0,"https://www.linkedin.com/posts/atonra_you-are-not-bullish-enough-on-us-healthcare-activity-7424728667685273602-7UoP","Who said making money and saving lives was incompatible"),
]

def true_date(url):
    m = re.search(r'(?:activity|ugcPost|share)[-:](\d{18,20})', url)
    if not m: return ""
    return datetime.datetime.fromtimestamp((int(m.group(1)) >> 22) / 1000, datetime.UTC).strftime("%Y-%m-%d")

with open(OUT, "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["author","channel","true_date_utc","index_date_posted","post_type_index","format","reactions","comments","shares","url","text_truncated","source"])
    for a,ch,d,pt,fm,r,c,s,u,t in R:
        w.writerow([a,ch,true_date(u),d,pt,fm,r,c,s,u,t[:280],SRC])
print(len(R), "rows")
