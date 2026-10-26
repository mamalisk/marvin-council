import {test,expect} from "@playwright/test";

test("marketplace definitions persist and retain their Markdown",async({page})=>{
  await page.goto("/marketplace");
  await page.getByRole("button",{name:"Create agent",exact:true}).click();
  await page.getByLabel("Name",{exact:true}).fill("Ada");
  await page.getByLabel("Specialization or category").fill("Security reviewer");
  await page.getByLabel("Markdown instructions").fill("# Ada\n\nInspect authorization boundaries. <script>alert('unsafe')</script>");
  await page.getByRole("button",{name:"Evidence-led",exact:true}).click();
  await page.getByRole("button",{name:"Save definition"}).click();
  await expect(page.getByRole("heading",{name:"Ada",exact:true})).toBeVisible();
  await page.reload();
  const card=page.locator("article").filter({has:page.getByRole("heading",{name:"Ada",exact:true})});
  await card.getByRole("button",{name:"Customize agent"}).click();
  await expect(page.getByLabel("Markdown instructions")).toContainText("Inspect authorization boundaries.");
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export Markdown"}).click();
  expect((await downloaded).suggestedFilename()).toBe("Ada.md");
});

test("create offline council with assigned context, answer, approve and export",async({page})=>{
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  await page.goto("/");
  await page.screenshot({path:"test-results/landing.png",fullPage:true});
  await page.getByRole("link",{name:"Explore the demo"}).click();
  await expect(page.getByRole("heading",{name:/Hello, Alex/})).toBeVisible();
  await page.screenshot({path:"test-results/dashboard.png",fullPage:true});
  await page.getByRole("button",{name:"Switch to light theme"}).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme","light");
  await page.getByRole("button",{name:"Switch to dark theme"}).click();
  await page.getByRole("button",{name:"Assemble a council"}).click();
  await page.getByRole("button",{name:"Use example brief"}).click();
  await page.getByLabel("Council name",{exact:true}).fill("Test discovery council");
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await page.getByLabel("Upload context documents").setInputFiles({name:"requirements.md",mimeType:"text/markdown",buffer:Buffer.from("# Requirements\n\nAll humans can read this document.")});
  const row=page.locator(".mc-doc-row").filter({hasText:"requirements.md"});
  await row.locator("summary").click();
  await row.getByLabel("Everyone",{exact:true}).uncheck();
  await row.getByLabel("Maya",{exact:true}).check();
  await row.locator("summary").click();
  await page.getByRole("button",{name:"Continue",exact:true}).click();
  await page.getByRole("button",{name:"Complete demo briefing"}).click();
  await page.getByRole("button",{name:"Continue to launch"}).click();
  await page.getByRole("button",{name:/Offline session Let agents/}).click();
  await page.getByPlaceholder("Search by @username").fill("sam");
  await page.getByRole("button",{name:/Sam Chen/}).click();
  await page.getByLabel("Token budget").fill("80000");
  await page.getByRole("button",{name:"Start offline session"}).click();
  await expect(page.getByRole("heading",{name:"Test discovery council",exact:true})).toBeVisible();
  await page.reload();
  await expect(page.getByText("Offline · accepting input",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"requirements.md",exact:true}).click();
  await expect(page.getByLabel("Document preview")).toContainText("All humans can read this document.");
  await page.getByLabel("Document preview").getByRole("button",{name:"Close"}).click();
  await page.getByRole("button",{name:"Write an answer",exact:true}).click();
  await page.getByLabel("Message the council").fill("All acceptance criteria are measurable and independently reviewed.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await page.getByRole("button",{name:"Ask Maya",exact:true}).click();
  await expect(page.getByLabel("Message the council")).toHaveValue("@Maya ");
  await page.getByLabel("Message the council").fill("@Maya Check the boundaries.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText(/That’s a useful constraint/)).toBeVisible();
  await page.getByRole("button",{name:"Preview voice transcription"}).click();
  await expect(page.getByText(/No microphone is recording/)).toBeVisible();
  await page.getByLabel("Message the council").fill("");
  await page.getByRole("button",{name:"Move to human review"}).click();
  await page.getByRole("button",{name:"Approve this revision"}).click();
  await page.getByLabel("Review as (demo only)").selectOption("sam-chen");
  await page.getByRole("button",{name:"Approve this revision"}).click();
  await expect(page.getByText("2 of 2 approved",{exact:true})).toBeVisible();
  await page.getByRole("button",{name:"Read specification"}).click();
  const downloaded=page.waitForEvent("download");
  await page.getByRole("button",{name:"Export Markdown"}).click();
  expect((await downloaded).suggestedFilename()).toBe("specification.md");
  await page.screenshot({path:"test-results/council.png",fullPage:true});
  await page.getByRole("button",{name:"Revise answer"}).click();
  await page.getByLabel("Message the council").fill("Include accessibility criteria too.");
  await page.getByRole("button",{name:"Send",exact:true}).click();
  await expect(page.getByText("0 of 2 approved",{exact:true})).toBeVisible();
  expect(errors).toEqual([]);
});

test("mobile pages fit the viewport",async({page})=>{
  await page.setViewportSize({width:390,height:844});
  for(const route of ["/","/dashboard","/marketplace","/councils/new","/councils/onboarding","/connection"]){
    await page.goto(route);
    await expect(page.locator("h1,h2").first()).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1),route).toBe(true);
  }
  await page.screenshot({path:"test-results/mobile.png",fullPage:true});
});

test("Copilot UI requires authentication before sending chat",async({page})=>{
  const calls:string[]=[];
  await page.route("**/api/copilot/check",async route=>{calls.push(route.request().postDataJSON().action);await route.fulfill({json:{runtime:true,authenticated:false,models:[]}});});
  await page.goto("/connection");
  await expect(page.getByRole("button",{name:"Send test greeting"})).toBeDisabled();
  await page.getByRole("button",{name:"Check Copilot access"}).click();
  await expect(page.getByText("Not authenticated",{exact:true})).toBeVisible();
  await expect(page.getByRole("button",{name:"Send test greeting"})).toBeDisabled();
  expect(calls).toEqual(["status"]);
});
