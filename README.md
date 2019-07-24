# QIS-Scraper
## Settings

| ENV variables  |   | 
|:---|---|
| INTERVAL  | Interval for scraping the website in seconds*  |
| CHAT_ID  | Telegram chat id  |
| USER  | QIS username  |
| DEGREE  | Degree on page 'Notenspiegel (alle Leistungen)'  |
| STUDY_PROGRAM  | Study program in first nested list on page 'Notenspiegel (alle Leistungen)'  |

`* Regardless of the interval the scraping is limited to daytime -> 7 a.m. to 10 p.m.`


| Portainer Secrets (default location*)  |   | 
|:---|---|
| BOT_TOKEN  | Telegram bot API token  |
| QIS_PASSWORD  | QIS password  |

`* Default location = /run/secrets/<NAME_OF_SECRET>`

## Bind mounts
| File  | Description  | Container path | Default content | Required permissions |
|:---|---|---|---|---|
| data.json  | Contains marks and averages of all exams and the total average  | `/data.json` | `{"totalAverage": null,"courses": {}}` | read/write for user node |
