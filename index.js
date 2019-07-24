if (!process.env.CHAT_ID
    || !process.env.QIS_USER
    || !process.env.DEGREE
    || !process.env.STUDY_PROGRAM) {
    console.log('\nMissing env variables!')
    process.exit(1)
}

const fs = require('fs')

if (process.env.NODE_ENV === 'production'
    && (!fs.existsSync('/run/secrets/BOT_TOKEN') || !fs.existsSync('/run/secrets/QIS_PASSWORD'))) {
    console.log('\nMissing portainer secrets!')
    process.exit(1)
}

let BOT_TOKEN = (process.env.NODE_ENV === 'production') ? fs.readFileSync('/run/secrets/BOT_TOKEN').toString() : 'SOMEBOTTOKEN'
let QIS_PASSWORD = (process.env.NODE_ENV === 'production') ? fs.readFileSync('/run/secrets/QIS_PASSWORD').toString() : 'SOMEQISPASSWORD'
let dataPath = (process.env.NODE_ENV === 'production') ? '/data.json' : './data.json'

const puppeteer = require('puppeteer')
const Telegraf = require('telegraf')
const bot = new Telegraf(BOT_TOKEN)
const moment = require('moment')
require('moment/locale/de')

run()
setInterval(() => {
    let hour = moment().hour()
    if (hour >= 7 && hour <= 22) run()
}, process.env.INTERVAL * 1000 || 3600000) // default = 1h

async function run() {
    try {
        let browser = await puppeteer.launch(
            (process.env.NODE_ENV === 'production') ? {
                args: [
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--window-size=1024,768',
                    '--lang=de-DE,de'
                ],
                executablePath: '/usr/bin/chromium-browser'
            } : {
                args: [
                    '--window-size=1024,768',
                    '--lang=de-DE,de'
                ],
                headless: false
            })


        let page = (await browser.pages())[0]
        await page.setViewport({
            width: 1024,
            height: 768
        })

        try {
            console.log(`starting (${moment().format()}) ...`)

            let prevData
            if (fs.existsSync(dataPath)) {
                prevData = JSON.parse(fs.readFileSync(dataPath))
            }
            if (!prevData) prevData = {
                totalAverage: null,
                courses: {}
            }

            await page.goto('https://qis.fh-schmalkalden.de/', { waitUntil: 'networkidle0' })
            await page.waitFor(1000)

            // Login
            await page.type('input#asdf.input_login', process.env.QIS_USER, { delay: 100 })
            await page.type('input#fdsa.input_login', QIS_PASSWORD, { delay: 100 })
            await page.click('input.submit')
            await page.waitForXPath('//a[text()="Prüfungsverwaltung"]')
            await page.waitFor(200)

            // Navigation
            await (await page.$x('//a[text()="Prüfungsverwaltung"]'))[0].click()
            await page.waitForXPath('//a[text()="Notenspiegel (alle Leistungen)"]')
            await page.waitFor(200)
            await (await page.$x('//a[text()="Notenspiegel (alle Leistungen)"]'))[0].click()
            await page.waitForXPath(`//div[@class="content"]//a[text()="${process.env.DEGREE}"]`)
            await page.waitFor(200)
            await (await page.$x(`//div[@class="content"]//a[text()="${process.env.DEGREE}"]`))[0].click()
            await page.waitForXPath(`//div[@class="content"]//*[normalize-space(text())="${process.env.STUDY_PROGRAM}"]/following::a[1]`)
            await page.waitFor(200)
            await (await page.$x(`//div[@class="content"]//*[normalize-space(text())="${process.env.STUDY_PROGRAM}"]/following::a[1]`))[0].click()
            await page.waitForXPath('//div[@class="content"]//*[contains(.,"Summe aller ECTS-Credits")]')
            await page.waitFor(3000)

            // Data scraping
            const dataRows = await page.$$eval('form table:nth-of-type(2) tr', trs => trs.map(tr => {
                const tds = [...tr.querySelectorAll('td,th')]
                return tds.map(td => td.innerText.trim().replace(/\\n/g, ''))
            }))
            
            let averageRow = dataRows.filter(el => el[1].indexOf('Summe aller ECTS-Credits') > -1)[0]
            let defaultRows = dataRows.filter((el, i) => i > 0 && el[1].indexOf('Summe aller ECTS-Credits') === -1)
            let data = {
                totalAverage: averageRow[2].replace(',', '.'),
                courses: {}
            }
            for (let row of defaultRows) {
                data.courses[row[1]] = {
                    mark: row[4].replace(',', '.'),
                    average: null
                }
            }
            
            let courses = Object.keys(data.courses)
            let messages = ['New marks:']
            let screenshots = []
            for (let course of courses) {
                if ((prevData.courses[course] === undefined || data.courses[course].mark !== prevData.courses[course].mark) && data.courses[course].mark !== '') {
                    await (await page.$x(`//div[@class="content"]//*[normalize-space(text())="${course}"]/following::a[1][contains(@href, "notenspiegel")]`))[0].click()
                    await page.waitForXPath('//td[normalize-space(text())="Durchschnittsnote"]')
                    await page.waitFor(3000)
                    let elementHandle = (await page.$x(`//td[normalize-space(text())="Durchschnittsnote"]/following::td[1]`))[0]
                    let courseAverage = await page.evaluate(td => td.innerText, elementHandle)
                    data.courses[course].average = courseAverage.replace(',', '.')

                        // capture overview of marks
                        let selector = 'div.content table:nth-of-type(3)'
                        let padding = 0
                        let rect = await page.evaluate(selector => {
                            const element = document.querySelector(selector)
                            const { x, y, width, height } = element.getBoundingClientRect()
                            const placeholderRow = element.children[0].children[0]
                            const placeholderRect = placeholderRow.getBoundingClientRect()
                            return { left: x, top: y + placeholderRect.height, width, height: height - placeholderRect.height }
                        }, selector)
                        let screenshot = await page.screenshot({
                            clip: {
                                x: rect.left - padding,
                                y: rect.top - padding,
                                width: rect.width + padding * 2,
                                height: rect.height + padding * 2
                            }
                        })

                    await page.goBack()
                    await page.waitForXPath('//div[@class="content"]//*[contains(.,"Summe aller ECTS-Credits")]')
                    await page.waitFor(3000)
                    messages.push(`${course}: ${data.courses[course].mark} (⌀ ${data.courses[course].average})`)
                    screenshots.push({ course: course, image: screenshot })
                }
            }
            if (messages.length > 1) {
                messages.push(`\n=> Weighted average: ${data.totalAverage}`)
                bot.telegram.sendMessage(process.env.CHAT_ID, messages.join('\n'))
            }
            for (let screenshot of screenshots) {
                bot.telegram.sendPhoto(process.env.CHAT_ID, { source: screenshot.image }, { caption: 'Overview of marks - ' + screenshot.course })
            }

            fs.writeFileSync(dataPath, JSON.stringify(data))

            await (await page.$x('//a[text()="Abmelden"]'))[0].click()
            await page.waitForXPath('//h3[text()="Sicherheitshinweis - bitte sorgfältig lesen!"]')

            browser.close()

            console.log(`finished`)
        }
        catch (e) {
            console.log(e)

            try {
                await (await page.$x('//a[text()="Abmelden"]'))[0].click()
                await page.waitForXPath('//h3[text()="Sicherheitshinweis - bitte sorgfältig lesen!"]')
                browser.close()
            }
            catch (e) {
                console.log(e)
                process.exit(1)
            }

            process.exit(1)
        }
    }
    catch (e) {
        console.log(e)
        process.exit(1)
    }
}
